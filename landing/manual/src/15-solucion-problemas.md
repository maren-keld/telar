---
title: Solución de problemas
slug: solucion-problemas
order: 14
summary: Gatekeeper, SmartScreen, Muse, PIN, actualizaciones y contacto.
---

# Solución de problemas

## macOS no abre Telar (Gatekeeper)

1. No uses «Mover a la papelera»
2. Ajustes del Sistema → Privacidad y seguridad
3. **Abrir de todos modos** junto al aviso de Telar
4. Guía con capturas: [Cómo instalar Telar](https://telarapp.cl/blog/como-instalar-telar)

## Windows SmartScreen

**Más información → Ejecutar de todas formas**. Descargá solo desde telarapp.cl o GitHub Releases oficiales.

## Olvidé el PIN

Telar no puede recuperar la base sin el PIN. Si tenés **respaldo Pro** y la **clave de recuperación**, restaurá desde ese flujo. Si no, los datos de esa instalación no son recuperables por el equipo de Telar.

## Muse 2 no conecta

- Confirmá que es **Muse 2** (no Muse S)
- Bluetooth encendido; banda cargada
- Cerrá otras apps que puedan estar usando la Muse
- Reiniciá banda y Telar; volvé a emparejar desde el módulo NF
- En algunos equipos, permisos de Bluetooth del sistema deben estar concedidos a Telar

## La IA no responde

- Verificá que esté activada en Ajustes
- Ollama: que el servicio local esté corriendo y el modelo descargado
- BYOK: API key válida, red disponible, cuota del proveedor
- Revisá el mensaje de error en el modal de IA

## Actualización o instalación rara

Desinstalá/reinstalá desde el instalador oficial. Los datos suelen permanecer en la carpeta de aplicación del usuario; si algo falla tras actualizar, escribinos antes de borrar carpetas de datos.

## Contacto

[contacto@telarapp.cl](mailto:contacto@telarapp.cl) — instaladores, Pro, curso NF y soporte de producto.
