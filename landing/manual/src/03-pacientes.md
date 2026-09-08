---
title: Pacientes y tratamientos
slug: pacientes
order: 3
summary: Crear pacientes, estados de tratamiento, etiquetas y el cupo Demo de 3 activos.
---

# Pacientes y tratamientos

La vista **Pacientes** es el punto de entrada habitual tras desbloquear Telar.

## Jerarquía

**Paciente → Tratamiento → Sesiones → Módulos**

Un paciente puede tener uno o más tratamientos. Cada tratamiento agrupa sesiones; cada sesión contiene módulos (escalas, handouts, NF, etc.).

## Crear un paciente

1. En Pacientes, elegí **Nuevo paciente** (o equivalente en la UI).
2. Completá los datos básicos.
3. Opcional: elegí una **plantilla de programa** (por ejemplo TDAH 8 sesiones) o empezá en blanco.
4. Se crea el tratamiento y se abre el workspace.

## Estados del tratamiento

| Estado | Uso típico |
|--------|------------|
| En tratamiento | Caso activo en consulta |
| Pausa | Suspendido temporalmente |
| Completado | Cierre acordado |
| Abandonado | Interrupción sin cierre formal |
| Archivado | Fuera de la lista activa |

En el plan **Demo**, el cupo cuenta solo pacientes con al menos un tratamiento **en tratamiento**. Pausados, completados, abandonados y archivados **no** consumen cupo.

## Cupo Demo (3 activos)

El plan gratis permite hasta **3 pacientes activos**. Si intentás crear o reactivar un cuarto, Telar ofrece pasar a Pro.

Para liberar cupo sin borrar datos: pasá un tratamiento a pausa o archivado.

## Etiquetas

Podés marcar pacientes con etiquetas clínicas de trabajo (por ejemplo alerta o derivado) para filtrar o priorizar en la lista. Las etiquetas son de organización; no sustituyen el registro clínico en módulos.

## Abrir un caso

Desde la lista, abrí el paciente o tratamiento. Entráis al **workspace**: barra lateral de sesiones/módulos y lienzo del módulo activo.
