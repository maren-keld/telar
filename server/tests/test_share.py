"""El buzón de escalas compartidas: solo ciphertext, una respuesta, y se borra."""
import base64

PAYLOAD = base64.b64encode(b"sobre-del-cuestionario").decode()
RESPONSE = base64.b64encode(b"sobre-de-la-respuesta").decode()
OWNER = "pro@telarapp.cl"


def create(api, payload_ct=PAYLOAD, email=OWNER):
    return api.post("/api/share", json={"owner_email": email, "payload_ct": payload_ct})


def test_ciclo_completo_del_enlace(api):
    created = create(api)
    assert created.status_code == 200
    token = created.get_json()["token"]
    secret = created.get_json()["owner_secret"]

    # El paciente abre el enlace y recibe el sobre tal cual.
    opened = api.get(f"/api/share/{token}")
    assert opened.status_code == 200
    assert opened.get_json()["payload_ct"] == PAYLOAD
    assert opened.get_json()["answered"] is False

    # Aún no hay nada que recoger.
    pending = api.get(f"/api/share/{token}/response?secret={secret}")
    assert pending.status_code == 200
    assert pending.get_json()["answered"] is False

    answered = api.post(f"/api/share/{token}/response", json={"response_ct": RESPONSE})
    assert answered.status_code == 200

    collected = api.get(f"/api/share/{token}/response?secret={secret}")
    assert collected.status_code == 200
    assert collected.get_json()["response_ct"] == RESPONSE

    # Recogida la respuesta, la fila desaparece.
    assert api.get(f"/api/share/{token}/response?secret={secret}").status_code == 410
    assert api.get(f"/api/share/{token}").status_code == 410


def test_no_se_puede_responder_dos_veces(api):
    token = create(api).get_json()["token"]
    assert api.post(f"/api/share/{token}/response", json={"response_ct": RESPONSE}).status_code == 200
    repeat = api.post(f"/api/share/{token}/response", json={"response_ct": RESPONSE})
    assert repeat.status_code == 409
    # Y el paciente que reabre el enlace ve que ya está respondido.
    assert api.get(f"/api/share/{token}").status_code == 409


def test_la_respuesta_exige_el_secreto_del_profesional(api):
    token = create(api).get_json()["token"]
    api.post(f"/api/share/{token}/response", json={"response_ct": RESPONSE})
    assert api.get(f"/api/share/{token}/response?secret=otro-secreto").status_code == 403
    assert api.get(f"/api/share/{token}/response").status_code == 400


def test_rechaza_correo_y_contenido_invalidos(api):
    assert create(api, email="no-es-correo").status_code == 400
    assert create(api, payload_ct="").status_code == 400
    assert create(api, payload_ct="no es base64 ✗").status_code == 400
    assert create(api, payload_ct="A" * 600_000).status_code == 400


def test_token_desconocido_no_filtra_existencia(api):
    # Malformado, inexistente y caducado responden lo mismo.
    assert api.get("/api/share/corto").status_code == 410
    assert api.get("/api/share/con.puntos.no.validos").status_code == 410
    assert api.get("/api/share/aaaaaaaaaaaaaaaaaaaa").status_code == 410


def test_revocar_borra_el_enlace(api):
    created = create(api).get_json()
    token, secret = created["token"], created["owner_secret"]
    assert api.delete(f"/api/share/{token}?secret=incorrecto").status_code == 403
    assert api.delete(f"/api/share/{token}?secret={secret}").status_code == 200
    assert api.get(f"/api/share/{token}").status_code == 410


def test_no_guarda_el_correo_en_claro(api):
    token = create(api).get_json()["token"]
    import app as api_module

    with api_module.db() as conn:
        row = conn.execute(
            "SELECT owner_hash FROM shared_forms WHERE token = ?", (token,)
        ).fetchone()
    assert OWNER not in row["owner_hash"]
