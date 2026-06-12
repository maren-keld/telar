# Términos y Condiciones de Uso — Telar

**Chile, junio de 2026.**

**Telar** es una aplicación de escritorio de código abierto (FOSS) diseñada para apoyar a profesionales de la salud mental en la gestión clínica de sus consultas. Todos los datos del usuario se almacenan exclusivamente en el dispositivo local del profesional, sin transmisión a servidores externos. Telar cumple con las disposiciones de la Ley N° 19.628 sobre Protección de la Vida Privada, la Ley N° 21.719 sobre protección de datos personales y la Ley N° 20.584 que regula los derechos y deberes en atención de salud.

---

## 1. Aceptación de los Términos

Al instalar y utilizar Telar, el usuario acepta estos Términos y Condiciones. Si el usuario no está de acuerdo con alguno de los términos, debe desinstalar la aplicación y abstenerse de usarla.

---

## 2. Naturaleza del software

Telar es una **aplicación de escritorio local**. Ello implica que:

- Todos los datos clínicos y del profesional se almacenan únicamente en el dispositivo del usuario.
- La aplicación no transmite datos a servidores propios ni a terceros durante el uso normal.
- La base de datos está cifrada localmente mediante SQLCipher (AES-256), protegida por un PIN de 6 dígitos derivado con Argon2id, con soporte opcional de Touch ID en macOS.
- Telar no tiene acceso, ni puede acceder, a los datos almacenados en el dispositivo del usuario.

Telar es **software de código abierto** publicado bajo licencia **GNU Affero General Public License v3.0 (AGPL-3.0)**. El código fuente está disponible públicamente. Ciertas funcionalidades avanzadas requieren una suscripción activa al **Plan Profesional**, conforme a lo indicado en la sección 7 de estos términos.

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

El módulo de Neurofeedback es una herramienta de **bienestar y autorregulación fisiológica** (*wellness device*), no un dispositivo médico. Su uso está orientado a protocolos de relajación y atención mediante retroalimentación de señal EEG en tiempo real. No está destinado al diagnóstico, tratamiento ni monitorización de enfermedades. Los datos de señal EEG registrados durante las sesiones se almacenan únicamente en el dispositivo del profesional.

---

## 6. Limitación de Responsabilidad Clínica

Telar proporciona **herramientas de apoyo al trabajo clínico**. La evaluación, diagnóstico y tratamiento de los pacientes son responsabilidad exclusiva del profesional de la salud mental.

Telar no se hace responsable por:

- Diagnósticos incorrectos, errores de juicio clínico o decisiones de tratamiento basadas en la información proporcionada por la aplicación.
- Errores técnicos o de programación que puedan afectar la interpretación de datos.
- La omisión o falla en la detección de riesgo suicida u otras situaciones de emergencia clínica. El módulo de diagnóstico incluye indicadores de riesgo como apoyo conceptual; la evaluación de riesgo vital es responsabilidad exclusiva del clínico.
- Pérdida de datos derivada del daño, pérdida o falla del dispositivo del usuario.

---

## 7. Licencia de Software y Plan Profesional

Telar se distribuye bajo licencia **AGPL-3.0**. Cualquier persona puede usar, estudiar, modificar y redistribuir el software conforme a los términos de dicha licencia.

Ciertas funcionalidades avanzadas están habilitadas exclusivamente para usuarios con **Plan Profesional** activo. El acceso a estas funcionalidades requiere una suscripción de pago gestionada a través de los canales oficiales de Telar. El Plan Profesional no modifica los derechos otorgados por la licencia AGPL-3.0 sobre el código fuente.

---

## 8. Pagos

Las transacciones para el Plan Profesional se realizan exclusivamente a través de los canales de pago oficiales indicados en el sitio web de Telar. Telar no solicita depósitos bancarios ni transferencias directas. Cualquier solicitud de pago fuera de los canales oficiales debe considerarse fraudulenta.

Al contratar el Plan Profesional, el usuario acepta que los montos ya facturados no son reembolsables. La cancelación de la suscripción no genera cargo adicional a partir del siguiente ciclo de facturación.

---

## 9. Actualizaciones de Software

Telar puede publicar actualizaciones que incorporen mejoras, correcciones de seguridad o nuevas funcionalidades. El usuario es responsable de mantener la aplicación actualizada. Telar no garantiza compatibilidad de versiones anteriores en caso de actualizaciones estructurales de la base de datos.

---

## 10. Actualización de estos Términos

Telar se reserva el derecho a actualizar estos Términos en cualquier momento. Los cambios serán comunicados mediante la publicación de una nueva versión en el repositorio oficial del proyecto y, cuando corresponda, mediante notificaciones en la aplicación.

---

## 11. Jurisdicción

Cualquier disputa derivada del uso de Telar se resolverá conforme a las leyes de la República de Chile, bajo la jurisdicción exclusiva de los tribunales chilenos.

---

# Política de Privacidad — Telar

## 1. Principio General: Privacidad Local

Telar adopta un modelo de **privacidad por diseño**: todos los datos del profesional y sus pacientes residen exclusivamente en el dispositivo del usuario. Telar no recopila, transmite ni almacena datos en servidores externos durante el uso normal de la aplicación.

## 2. Datos Almacenados Localmente

La aplicación almacena en la base de datos local del usuario:

**Del profesional:** nombre, correo electrónico, celular, dirección de atención y preferencias de la aplicación. Estos datos se guardan localmente y no se transmiten a Telar.

**De los pacientes:** nombre completo, número de identificación (RUT u otro), correo electrónico, teléfono, dirección, género, fecha de nacimiento, estado civil, ocupaciones, notas clínicas, diagnósticos, redes de apoyo, resultados de escalas psicométricas, datos de sesiones y grabaciones de neurofeedback (incluida señal EEG en bruto).

Todos estos datos están cifrados en reposo mediante SQLCipher (AES-256). El acceso requiere autenticación mediante PIN de 6 dígitos o Touch ID.

## 3. Sin Telemetría ni Rastreo

Telar no utiliza:

- Cookies ni identificadores de usuario remotos.
- Herramientas de analítica o seguimiento de comportamiento.
- Llamadas a API externas durante el uso clínico.

El único acceso externo ocurre al verificar actualizaciones disponibles (opcional y controlado por el usuario).

## 4. Responsabilidad del Profesional sobre los Datos

El profesional que utiliza Telar es el **responsable del tratamiento de los datos personales** de sus pacientes, en los términos de la Ley N° 19.628, la Ley N° 21.719 y la Ley N° 20.584. Ello implica:

- Obtener el consentimiento informado del paciente antes de registrar sus datos.
- Informar al paciente sobre la existencia de su ficha clínica digital y su derecho a acceder, rectificar o solicitar la eliminación de sus datos.
- Garantizar que el dispositivo donde se ejecuta la aplicación cuente con las medidas de seguridad apropiadas (contraseña de sistema, cifrado de disco, acceso físico controlado).

## 5. Respaldo y Eliminación de Datos

El usuario puede respaldar su base de datos copiando el archivo `telar.enc.db` desde el directorio de datos de la aplicación, o **exportar sus datos en formato CSV** desde **Ajustes → Privacidad y datos → Descargar mis datos** (carpeta en Documentos/Telar/exportaciones/).

Desde la misma sección puede **solicitar la eliminación completa** de todos los datos clínicos y de perfil almacenados en la aplicación. La eliminación de la base de datos o la desinstalación de la aplicación también resulta en la eliminación permanente e irrecuperable de todos los datos locales.

Telar no puede recuperar datos eliminados, ya que no conserva copias de la base de datos del usuario.

## 6. Datos para Facturación del Plan Profesional

Para gestionar suscripciones al Plan Profesional, Telar puede recopilar datos de facturación del profesional (nombre, RUT, correo electrónico) a través de la plataforma de pago correspondiente. Estos datos se utilizan exclusivamente para fines de facturación y no se vinculan a los datos clínicos almacenados localmente.

## 7. Seguridad Técnica

- **Cifrado en reposo:** SQLCipher (AES-256) con clave derivada de PIN mediante Argon2id (64 MiB, 3 iteraciones).
- **Autenticación:** PIN de 6 dígitos con bloqueo progresivo por intentos fallidos. Touch ID disponible en macOS mediante Keychain del sistema.
- **Arquitectura:** sin servidor, sin base de datos remota, sin transmisión de datos clínicos.

## 8. Actualización de esta Política

Esta política puede actualizarse junto con el software. Los cambios se publicarán en el repositorio oficial del proyecto. El uso continuado de la aplicación tras una actualización implica la aceptación de la nueva versión.

---

*Versión: junio 2026 — Telar*
