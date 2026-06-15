# Términos y Condiciones de Uso — Telar

**Chile, junio de 2026.**

**Telar** es una aplicación de escritorio de código abierto (FOSS) diseñada para apoyar a profesionales de la salud mental en la gestión clínica de sus consultas. Todos los datos del usuario se almacenan exclusivamente en el dispositivo local del profesional, sin transmisión a servidores externos, **salvo que el profesional active voluntariamente el Asistente IA en modo API externa (ver §6)**. Telar cumple con las disposiciones de la Ley N° 19.628 sobre Protección de la Vida Privada, la Ley N° 21.719 sobre protección de datos personales y la Ley N° 20.584 que regula los derechos y deberes en atención de salud.

---

## 1. Aceptación de los Términos

Al instalar y utilizar Telar, el usuario acepta estos Términos y Condiciones. Si el usuario no está de acuerdo con alguno de los términos, debe desinstalar la aplicación y abstenerse de usarla.

---

## 2. Naturaleza del software

Telar es una **aplicación de escritorio local**. Ello implica que:

- Todos los datos clínicos y del profesional se almacenan únicamente en el dispositivo del usuario.
- La aplicación no transmite datos a servidores propios ni a terceros durante el uso normal, **con las siguientes excepciones explícitas y voluntarias**: (a) el ping anónimo de uso (§3 de la Política de Privacidad, opt-out disponible), (b) la verificación de suscripción al Plan Profesional, y (c) el uso del Asistente IA en modo API externa (§6).
- La base de datos está cifrada localmente mediante SQLCipher (AES-256), protegida por un PIN de 6 dígitos derivado con Argon2id, con soporte opcional de Touch ID en macOS.
- Telar no tiene acceso, ni puede acceder, a los datos almacenados en el dispositivo del usuario.

Telar es **software de código abierto** publicado bajo licencia **GNU Affero General Public License v3.0 (AGPL-3.0)**. El código fuente está disponible públicamente. Ciertas funcionalidades avanzadas requieren una suscripción activa al **Plan Profesional**, conforme a lo indicado en la sección 8 de estos términos.

---

## 3. Uso Permitido

Telar está diseñada para uso exclusivo de **profesionales habilitados en el área de la salud mental**: psicólogos, psiquiatras, trabajadores sociales clínicos y estudiantes en práctica bajo supervisión de un profesional licenciado.

Los usuarios se comprometen a:

- Utilizar la aplicación únicamente con fines profesionales y éticos.
- No ingresar datos de terceros sin el consentimiento informado del paciente, conforme a la Ley N° 20.584 y la normativa ética del Colegio de Psicólogos de Chile.
- No utilizar la aplicación para actividades ilegales o contrarias a los principios deontológicos de la profesión.

La aplicación está diseñada para el contexto regulatorio chileno. Los usuarios que la utilicen en otros países son responsables de verificar su conformidad con la legislación local aplicable.

---

## 4. Responsabilidades del Usuario

El usuario es el único responsable de:

- **Obtener el consentimiento informado** de sus pacientes antes de ingresar cualquier dato personal o clínico.
- **Resguardar el PIN** de acceso a la aplicación. La pérdida del PIN implica la pérdida del acceso a los datos cifrados, ya que Telar no almacena ni puede recuperar claves de acceso.
- **Realizar respaldos** periódicos de la base de datos local (`telar.enc.db`), ya que la pérdida o daño del dispositivo puede resultar en pérdida irreversible de datos.
- Mantener actualizado su sistema operativo y los permisos de la aplicación.
- **Verificar el cumplimiento normativo del proveedor de IA externo** que configure en Ajustes, en caso de utilizar el Asistente IA en modo API externa (ver §6).

Los estudiantes en práctica deben utilizar la aplicación bajo supervisión directa de un profesional habilitado y asegurarse de que los pacientes estén informados sobre su condición de estudiante.

---

## 5. Instrumentos Clínicos

### 5.1 DASS-21

El módulo DASS-21 implementa la *Depression Anxiety Stress Scales — 21 ítems* (Lovibond & Lovibond, 1995). Este instrumento es propiedad intelectual de la Psychology Foundation of Australia y se utiliza con fines clínicos conforme a las condiciones de uso no comercial establecidas por sus autores. La versión en español utilizada corresponde a la adaptación validada disponible públicamente. El usuario reconoce que el DASS-21 es una herramienta de tamizaje, no de diagnóstico.

### 5.2 Escala de Autoestima de Rosenberg (EAR)

La EAR (Rosenberg, 1965) es un instrumento de uso libre ampliamente validado en población hispanohablante. Se utiliza con fines de evaluación clínica orientativa. No reemplaza una evaluación psicológica integral.

### 5.3 Escala de Estilos Defensivos (EED)

La EED es un instrumento de **elaboración propia** de Telar. No ha sido validada ni estandarizada en estudios clínicos controlados. Su uso tiene carácter exploratorio y orientativo dentro del proceso terapéutico, y no reemplaza el juicio clínico profesional ni los sistemas diagnósticos categoriales (CIE-11, DSM-5-TR).

### 5.4 Neurofeedback

El módulo de Neurofeedback es una herramienta de **bienestar y autorregulación fisiológica** (*wellness device*), no un dispositivo médico. Su uso está orientado a protocolos de relajación y atención mediante retroalimentación de señal EEG en tiempo real. No está destinado al diagnóstico, tratamiento ni monitorización de enfermedades. Los datos de señal EEG registrados durante las sesiones se almacenan únicamente en el dispositivo del profesional, cifrados con SQLCipher. El profesional debe informar al paciente y obtener consentimiento informado antes de registrar EEG.

### 5.5 ASRS v1.1 (TDAH en adultos)

Implementa el *Adult ADHD Self-Report Scale* v1.1 (Kessler et al., 2005; WHO). Tamizaje orientativo de TDAH en adultos; la Parte A sigue criterios WHO. No es instrumento diagnóstico. El profesional es responsable de interpretación clínica e integración con entrevista.

### 5.6 GAD-7 (Ansiedad generalizada)

Implementa el *Generalized Anxiety Disorder 7-item scale* (Spitzer, Kroenke, Williams & Löwe, 2006). Uso clínico con atribución a los autores del PHQ/GAD. Tamizaje de ansiedad generalizada; no sustituye evaluación diagnóstica.

### 5.7 PCL-5 (TEPT DSM-5)

Implementa el *PTSD Checklist for DSM-5* (Weathers et al., 2013). Tamizaje de estrés postraumático; punto de corte orientativo. No reemplaza entrevista clínica estructurada ni diagnóstico.

### 5.8 IES-R (Impacto de eventos)

Implementa la *Impact of Event Scale — Revised* (Weiss & Marmar, 1997). Mide intrusión, evitación e hiperactivación tras eventos estresantes. Uso orientativo; no es diagnóstico de TEPT.

### 5.9 SPRINT-E-CL (Trauma breve — Chile)

Implementa el *Short Posttraumatic Stress Disorder Rating Interview* adaptado y validado en Chile (Norris et al.; Leiva-Bianchi & Gallardo, 2013, contexto 27-F). Tamizaje breve de estrés postraumático. El profesional verifica permisos de reproducción según la versión utilizada.

### 5.10 A-DES (Disociación adolescente)

Implementa la *Adolescent Dissociative Experiences Scale* (Armstrong, Putnam & Carlson, 1997). Instrumento de dominio público para adolescentes (10–21 años). Tamizaje de disociación; no es diagnóstico.

### 5.11 QOLS (Calidad de vida)

Implementa la *Quality of Life Scale* (Flanagan; adaptación Burckhardt et al.). Evalúa satisfacción en dominios de la vida. Uso orientativo en seguimiento clínico.

### 5.12 Material TCC Telar (elaboración propia)

Material TCC Telar (elaboración propia): Modelo ABC, Plan de seguridad vital, Activación conductual, Cuestionamiento socrático, Flexibilidad cognitiva, Probabilidades vs posibilidades, Identificando sesgos, Exploración de autoconceptos/preocupaciones, Rutinas de gratitud y reducción de estrés. Son herramientas psicoeducativas y de registro clínico; **no sustituyen** evaluación profesional, formulación del caso ni protocolos de riesgo vital. El Plan de seguridad vital es apoyo orientativo; la evaluación de riesgo suicida es responsabilidad exclusiva del clínico (véase también sección 7).

---

## 6. Asistente de Inteligencia Artificial

Telar incluye un **Asistente de Inteligencia Artificial** opcional, accesible desde **Ajustes → Asistente IA**. Esta funcionalidad está **desactivada por defecto** y requiere configuración explícita por parte del profesional. Existen dos modos de operación:

### 6.1 Modo local (Ollama)

En modo local, los modelos de IA se ejecutan íntegramente en el dispositivo del profesional mediante [Ollama](https://ollama.com/), un software de terceros de código abierto que el usuario debe instalar y configurar por separado. **Ningún dato sale del dispositivo.** Telar no proporciona ni recomienda modelos específicos; la elección del modelo y el cumplimiento de su licencia son responsabilidad exclusiva del profesional.

### 6.2 Modo API externa (OpenAI-compatible)

En este modo, el profesional configura voluntariamente un proveedor de IA externo (Mistral AI, OpenAI, OpenRouter u otro servicio compatible con la API de OpenAI). El contenido del mensaje enviado —que puede incluir resúmenes clínicos o el contexto del caso generado mediante la función **«Exportar contexto»**— **se transmite al servidor del proveedor externo elegido** a través de la conexión a internet del profesional.

En este modo se aplican las siguientes condiciones:

- Los datos enviados quedan sometidos a la **política de privacidad y los términos de uso del proveedor externo**. Telar no controla, no accede ni garantiza el tratamiento que dicho proveedor realice de la información.
- El profesional es el **único responsable** de verificar que el proveedor externo elegido cumple con los requisitos de la Ley N° 19.628, la Ley N° 21.719 y la normativa aplicable a datos de salud en el país donde ejerce.
- **Telar no recomienda enviar datos identificables** de pacientes (nombre completo, RUT u otro identificador directo) al Asistente IA. La función «Exportar contexto» genera resúmenes psicométricos y de módulos clínicos; el profesional debe revisar su contenido antes de enviarlo.
- La clave de API ingresada en Ajustes se almacena localmente en el perfil del profesional, cifrada junto al resto de la base de datos. Telar no transmite dicha clave a sus propios servidores.

### 6.3 Limitación de responsabilidad del Asistente IA

El Asistente IA genera texto de forma automática y puede cometer errores, omisiones o producir información inexacta o inapropiada para el contexto clínico. Sus sugerencias tienen carácter **orientativo** y no constituyen diagnóstico, formulación de caso, tratamiento ni supervisión clínica. El juicio profesional del terapeuta prevalece siempre sobre cualquier output del asistente. Telar no se hace responsable de decisiones clínicas adoptadas con base en las respuestas del Asistente IA.

---

## 7. Limitación de Responsabilidad Clínica

Telar proporciona **herramientas de apoyo al trabajo clínico**. La evaluación, diagnóstico y tratamiento de los pacientes son responsabilidad exclusiva del profesional de la salud mental.

Telar no se hace responsable por:

- Diagnósticos incorrectos, errores de juicio clínico o decisiones de tratamiento basadas en la información proporcionada por la aplicación.
- Errores técnicos o de programación que puedan afectar la interpretación de datos.
- La omisión o falla en la detección de riesgo suicida u otras situaciones de emergencia clínica. El módulo de diagnóstico incluye indicadores de riesgo como apoyo conceptual; la evaluación de riesgo vital es responsabilidad exclusiva del clínico.
- Pérdida de datos derivada del daño, pérdida o falla del dispositivo del usuario.
- Outputs generados por el Asistente IA, incluyendo errores, sesgos o contenido inadecuado producido por modelos de terceros (ver §6.3).

---

## 8. Licencia de Software y Plan Profesional

Telar se distribuye bajo licencia **AGPL-3.0**. Cualquier persona puede usar, estudiar, modificar y redistribuir el software conforme a los términos de dicha licencia.

Ciertas funcionalidades avanzadas están habilitadas exclusivamente para usuarios con **Plan Profesional** activo. El acceso a estas funcionalidades requiere una suscripción de pago gestionada a través de los canales oficiales de Telar. El Plan Profesional no modifica los derechos otorgados por la licencia AGPL-3.0 sobre el código fuente.

---

## 9. Pagos

Las transacciones para el Plan Profesional se realizan exclusivamente a través de los canales de pago oficiales indicados en el sitio web de Telar. Telar no solicita depósitos bancarios ni transferencias directas. Cualquier solicitud de pago fuera de los canales oficiales debe considerarse fraudulenta.

Al contratar el Plan Profesional, el usuario acepta que los montos ya facturados no son reembolsables. La cancelación de la suscripción no genera cargo adicional a partir del siguiente ciclo de facturación.

---

## 10. Actualizaciones de Software

Telar puede publicar actualizaciones que incorporen mejoras, correcciones de seguridad o nuevas funcionalidades. El usuario es responsable de mantener la aplicación actualizada. Telar no garantiza compatibilidad de versiones anteriores en caso de actualizaciones estructurales de la base de datos.

---

## 11. Actualización de estos Términos

Telar se reserva el derecho a actualizar estos Términos en cualquier momento. Los cambios serán comunicados mediante la publicación de una nueva versión en el repositorio oficial del proyecto y, cuando corresponda, mediante notificaciones en la aplicación.

---

## 12. Jurisdicción

Cualquier disputa derivada del uso de Telar se resolverá conforme a las leyes de la República de Chile, bajo la jurisdicción exclusiva de los tribunales chilenos.

---

# Política de Privacidad — Telar

## 1. Principio General: Privacidad Local

Telar adopta un modelo de **privacidad por diseño**: todos los datos del profesional y sus pacientes residen exclusivamente en el dispositivo del usuario. Telar no recopila, transmite ni almacena datos en servidores externos durante el uso normal de la aplicación, **salvo las excepciones explícitas descritas en §3**.

## 2. Datos Almacenados Localmente

La aplicación almacena en la base de datos local del usuario:

**Del profesional:** nombre, correo electrónico, celular, dirección de atención y preferencias de la aplicación (incluida la configuración del Asistente IA). Estos datos se guardan localmente y no se transmiten a Telar.

**De los pacientes:** nombre completo, número de identificación (RUT u otro), correo electrónico, teléfono, dirección, género, fecha de nacimiento, estado civil, ocupaciones, notas clínicas, diagnósticos, redes de apoyo, resultados de escalas psicométricas, datos de sesiones y grabaciones de neurofeedback (incluida señal EEG en bruto).

Todos estos datos están cifrados en reposo mediante SQLCipher (AES-256). El acceso requiere autenticación mediante PIN de 6 dígitos o Touch ID.

## 3. Transmisiones externas (opt-out o voluntarias)

Telar **no** utiliza cookies, identificadores de usuario remotos ni herramientas de analítica de comportamiento. Los datos clínicos **no se transmiten** en el uso normal de la aplicación. Las únicas transmisiones existentes son:

**a) Ping anónimo de uso (opt-out):** Al abrir la aplicación puede enviarse un ping anónimo (máximo una vez al día) a la mini-API de Telar con **solo la versión de la app**. El servidor incrementa un contador agregado y descarta la dirección IP; no se asocia a profesional ni paciente. Puedes desactivarlo en **Ajustes → Privacidad y datos → Contador anónimo de uso**.

**b) Verificación de suscripción:** Al activar o verificar el Plan Profesional se transmite el correo electrónico de facturación a la API de Telar, exclusivamente para validar el estado de la suscripción. No se transmiten datos clínicos.

**c) Asistente IA en modo API externa:** Si el profesional configura voluntariamente un proveedor de IA externo (Mistral, OpenAI, etc.) en **Ajustes → Asistente IA**, los mensajes enviados al asistente —que pueden incluir resúmenes psicométricos o contexto clínico exportado— se transmiten directamente desde el dispositivo al servidor del proveedor externo elegido. Telar no intercepta, almacena ni procesa estos mensajes. El profesional asume la responsabilidad de verificar que el proveedor cumple con la normativa de protección de datos aplicable. Ver §6 de los Términos y Condiciones.

Otros accesos externos no clínicos:
- Verificación de actualizaciones (opcional).

## 4. Responsabilidad del Profesional sobre los Datos

El profesional que utiliza Telar es el **responsable del tratamiento de los datos personales** de sus pacientes, en los términos de la Ley N° 19.628, la Ley N° 21.719 y la Ley N° 20.584. Ello implica:

- Obtener el consentimiento informado del paciente antes de registrar sus datos.
- Informar al paciente sobre la existencia de su ficha clínica digital y su derecho a acceder, rectificar o solicitar la eliminación de sus datos.
- Garantizar que el dispositivo donde se ejecuta la aplicación cuente con las medidas de seguridad apropiadas (contraseña de sistema, cifrado de disco, acceso físico controlado).
- Verificar que los proveedores de IA externos que configure cumplan con la normativa vigente antes de enviarles información de pacientes.

### 4.1 Señal EEG (neurofeedback) — informar al paciente

La señal cerebral (EEG) registrada durante sesiones de neurofeedback es un **dato sensible de salud**. Telar la almacena **solo en tu computador**, cifrada con SQLCipher (AES-256), junto al resto de la ficha clínica. No se sube a servidores de Telar.

Antes de la primera grabación, informa al paciente (o tutor en menores) que:

- Se registrará actividad eléctrica cerebral durante la sesión con una banda Muse 2.
- Los datos permanecen en el dispositivo del profesional y forman parte de la ficha clínica local.
- Puede solicitar acceso, rectificación o eliminación conforme a la Ley N° 19.628 / 21.719.

Texto sugerido para consentimiento informado: *«La señal cerebral de la sesión de neurofeedback se guarda de forma cifrada únicamente en el computador del/la psicólogo/a, como parte de tu ficha clínica. No se envía a internet ni a terceros.»*

## 5. Respaldo y Eliminación de Datos

El usuario puede respaldar su base de datos copiando el archivo `telar.enc.db` desde el directorio de datos de la aplicación, o **exportar sus datos en formato CSV** desde **Ajustes → Privacidad y datos → Descargar mis datos** (carpeta en Documentos/Telar/exportaciones/).

Desde la misma sección puede **solicitar la eliminación completa** de todos los datos clínicos y de perfil almacenados en la aplicación. La eliminación de la base de datos o la desinstalación de la aplicación también resulta en la eliminación permanente e irrecuperable de todos los datos locales.

Telar no puede recuperar datos eliminados, ya que no conserva copias de la base de datos del usuario.

## 6. Datos para Facturación del Plan Profesional

Para gestionar suscripciones al Plan Profesional, Telar puede recopilar datos de facturación del profesional (nombre, RUT, correo electrónico) a través de la plataforma de pago correspondiente. Estos datos se utilizan exclusivamente para fines de facturación y no se vinculan a los datos clínicos almacenados localmente.

## 7. Seguridad Técnica

- **Cifrado en reposo:** SQLCipher (AES-256) con clave derivada de PIN mediante Argon2id (64 MiB, 3 iteraciones).
- **Autenticación:** PIN de 6 dígitos con bloqueo progresivo por intentos fallidos. Touch ID disponible en macOS mediante Keychain del sistema.
- **Arquitectura:** sin servidor propio, sin base de datos remota, sin transmisión de datos clínicos en uso normal.

## 8. Actualización de esta Política

Esta política puede actualizarse junto con el software. Los cambios se publicarán en el repositorio oficial del proyecto. El uso continuado de la aplicación tras una actualización implica la aceptación de la nueva versión.

---

*Versión: junio 2026 — Telar*
