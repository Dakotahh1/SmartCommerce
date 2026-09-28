# 1. Definición del proyecto

> Documento vivo. Versión EP1 (arquitectura y pipeline DevSecOps).

## 1.1 Nombre y área

**SmartCommerce** — Área de aplicación: **comercio y servicios** (comercio minorista de productos de consumo masivo).

## 1.2 Descripción breve

SmartCommerce es una plataforma **web, PWA y móvil (Android)** que ayuda a consumidores finales a **decidir qué producto comprar** sin pasar horas investigando. El sistema **obtiene información pública de productos desde la Web** (Open Food Facts y Open Prices), **la limpia, valida y normaliza**, y un **motor inteligente (SmartMatch)** genera **recomendaciones y comparaciones personalizadas y explicables** según las preferencias declaradas y el comportamiento de cada cliente.

La interfaz se construye con **Angular + Ionic + Capacitor**; el backend principal con **NestJS**, el procesamiento especializado con **Python + FastAPI** y la persistencia con **PostgreSQL**.

## 1.3 Situación que origina el proyecto

En el comercio minorista comparar **solo por precio** es insuficiente. Para elegir un producto de supermercado un consumidor debe equilibrar al mismo tiempo:

| Variable | Dónde está hoy la información |
|---|---|
| Características (ingredientes, alérgenos, aptitud vegana/sin gluten) | Etiqueta física, sitios del fabricante |
| Calidad nutricional (Nutri-Score, sellos "ALTO EN" de la Ley 20.606) | Etiqueta física, apps de escaneo |
| Nivel de procesamiento (NOVA) e impacto ambiental | Bases de datos abiertas, poco conocidas |
| Precio por kilo / litro | Sitios de cada supermercado |
| Disponibilidad en tiendas | Sitios de cada supermercado |
| Preferencias personales | Solo en la cabeza del consumidor |

La información está **dispersa**, usa **unidades distintas** (precio por envase vs. por kilo) y **no está personalizada**. El consumidor se abruma y termina decidiendo por costumbre o por el precio del envase.

## 1.4 Problema delimitado

> **Desarrollar una plataforma web y móvil que recomiende y compare productos envasados de supermercado disponibles en Chile para consumidores finales, de acuerdo con sus preferencias explícitas (pesos de nutrición, precio, procesamiento, impacto ambiental y disponibilidad), restricciones (alérgenos y dieta) y su historial de interacción, utilizando información obtenida y normalizada desde las bases de datos abiertas Open Food Facts y Open Prices, entregando una explicación verificable de cada recomendación.**

## 1.5 Usuarios objetivo

| Rol | Descripción | Necesidad principal |
|---|---|---|
| **Visitante** | Persona sin cuenta | Explorar el catálogo y ver puntajes generales (no personalizados) |
| **Consumidor registrado** (`user`) | Persona que compra en supermercados en Chile, 18–60 años, usa el celular al comprar | Recomendaciones y comparaciones personalizadas y explicadas, en pocos segundos |
| **Operador de datos** (`operator`) | Integrante del equipo que mantiene el catálogo | Ejecutar y supervisar ingestas desde la fuente web |
| **Administrador** (`admin`) | Responsable de la plataforma | Gestionar usuarios y roles, revisar el estado del sistema |

**Personas de referencia** (para diseño y pruebas):

- *Camila, 29 años, celíaca*: necesita descartar rápido productos con gluten y prefiere opciones con Nutri-Score A/B aunque cuesten un poco más.
- *Jorge, 45 años, presupuesto ajustado*: prioriza el precio por kilo, pero quiere evitar productos con muchos sellos "ALTO EN" para sus hijos.
- *Valentina, 34 años, vegana*: le importa el impacto ambiental y el nivel de procesamiento.

## 1.6 Tareas que necesitan realizar los usuarios

1. Buscar un producto o categoría (p. ej., "avena") y filtrar por restricciones.
2. Entender rápidamente la calidad de un producto (Nutri-Score, NOVA, Eco-Score, sellos).
3. Comparar 2 a 4 alternativas lado a lado y saber **cuál le conviene a él/ella y por qué**.
4. Recibir recomendaciones personalizadas y **aceptarlas, rechazarlas o ajustar** los criterios.
5. Consultar la **procedencia y actualidad** de los datos.
6. (Operador/Admin) Actualizar el catálogo desde la fuente web y monitorear la calidad de datos.

## 1.7 Limitaciones de las soluciones existentes

| Solución | Limitación |
|---|---|
| Comparadores de precios | Ordenan solo por precio; no consideran calidad, restricciones ni preferencias |
| Apps de escaneo nutricional (p. ej., Yuka, app de Open Food Facts) | Puntaje genérico igual para todos; no integran precio ni disponibilidad; requieren tener el producto en la mano |
| Sitios de supermercados | Información parcial, sesgada a su propio catálogo, sin comparación entre cadenas |
| Etiquetado físico (sellos Ley 20.606) | Informa excesos, pero no ayuda a elegir entre alternativas |

## 1.8 ¿Por qué una aplicación web multiplataforma?

- El consumidor decide **en la tienda (móvil, conectividad variable)** y **en casa (escritorio, lista de compras)**: se requiere Android, PWA instalable y navegador desde **una sola base de código** (Angular + Ionic + Capacitor).
- La PWA permite **funcionamiento parcial sin conexión** (favoritos y últimas recomendaciones en caché).
- La lógica de recomendación y la integración con fuentes externas deben centralizarse en servidores para ser **auditables, seguras y actualizables** sin publicar nuevas versiones de la app.

## 1.9 Valor aportado

- **Decisiones informadas en segundos**: un puntaje SmartMatch 0–100 por producto con desglose por criterio.
- **Transparencia**: cada recomendación muestra *por qué* (criterios, pesos y datos usados) y *de dónde* vienen los datos.
- **Control**: el usuario ajusta pesos, descarta sugerencias y puede **desactivar la personalización**.
- **Datos abiertos reutilizados responsablemente**, con licencia y procedencia registradas.

## 1.10 Objetivos

**Objetivo general.** Diseñar, implementar, desplegar y evaluar una aplicación web multiplataforma que obtenga información de productos desde fuentes web abiertas y adapte recomendaciones y comparaciones a las preferencias y comportamiento de cada consumidor de manera segura, transparente y verificable.

**Objetivos específicos.**

| # | Objetivo | Indicador de logro | Entrega |
|---|---|---|---|
| OE1 | Definir una arquitectura multiplataforma integrada (Ionic/Angular/Capacitor – NestJS – FastAPI – PostgreSQL) | Diagramas C4, ADR y flujo mínimo extremo a extremo funcionando con Docker Compose | EP1 |
| OE2 | Automatizar construcción, verificación y seguridad con un pipeline DevSecOps | Pipeline con quality gates que bloquean ante pruebas fallidas, secretos o vulnerabilidades críticas | EP1 |
| OE3 | Obtener, validar, normalizar y deduplicar productos desde Open Food Facts | ≥ 90 % de registros válidos, < 5 % duplicados, procedencia en 100 % de los registros | EP2 |
| OE4 | Implementar el motor SmartMatch personalizado y explicable | Precision@5 personalizada ≥ 20 % superior a la versión base no adaptativa | EF |
| OE5 | Desplegar y monitorear en staging con rollback | Despliegue automático, health checks y rollback demostrado | EP2–EF |
| OE6 | Evaluar utilidad, comprensión y accesibilidad con usuarios | Tasa de éxito de tareas ≥ 80 %, comprensión de explicaciones ≥ 4/5, WCAG AA | EF |

## 1.11 Alcance y exclusiones

**Incluido**

- Catálogo de productos envasados de supermercado con país de venta **Chile** (≈ 6.700 productos disponibles en Open Food Facts a septiembre de 2026).
- Registro, inicio/cierre de sesión, roles (`admin`, `operator`, `user`) y visitante anónimo.
- Preferencias: pesos por criterio, dietas, alérgenos a excluir, evitar sellos "ALTO EN", activar/desactivar personalización.
- Búsqueda, detalle de producto, comparación de 2–4 productos, recomendaciones personalizadas con explicación.
- Registro de interacciones (vistas, favoritos, comparaciones, descartes) para la adaptación.
- Ingesta de datos desde Open Food Facts/Open Prices ejecutada por operadores, con métricas de calidad.
- Navegador, PWA instalable y app Android (Capacitor). Diseño adaptable móvil/tableta/escritorio.

**Excluido**

- Venta, carrito de compras o pagos (la plataforma **no vende**; ayuda a decidir).
- Web scraping de sitios de supermercados (riesgos legales y de términos de servicio).
- Precios oficiales en tiempo real: los precios son colaborativos y pueden no estar disponibles (se informa al usuario).
- Aplicación iOS (opcional según el enunciado).
- Recomendaciones médicas o nutricionales profesionales.

## 1.12 Principales funcionalidades

| Funcionalidad | Estado EP1 | Entrega objetivo |
|---|---|---|
| Autenticación (registro, login, refresh rotativo, logout, eliminación de cuenta) y roles | Implementada | EP1 |
| Catálogo: listado, búsqueda con filtros y detalle de productos | API + UI implementadas | EP1–EP2 |
| Ingesta Open Food Facts vía servicio Python | Endpoint funcional + persistencia + reporte de calidad + UI de administración | EP1–EP2 |
| Normalización, validación, deduplicación y cálculo de sellos Ley 20.606 | Implementada en Python | EP1–EP2 |
| Recomendaciones SmartMatch con explicación | Ranking multicriterio funcional (v0.1) con UI explicable | EP1 → EF |
| Comparación de productos | API + UI implementadas (2–4 productos, ganador por criterio) | EP1 → EP2 |
| Aprendizaje de preferencias por interacción | Función inicial acotada (ajustes de pesos y afinidades) + restablecer | EF |
| Modo sin conexión y degradación controlada | Caché de recomendaciones, banners y ranking de respaldo | EP1 → EF |
| Panel de ingesta y estado del sistema | UI + `/api/health` + métricas por ruta | EP1 → EP2 |
| App Android | Proyecto Capacitor; APK debug generado por el pipeline | EP1 → EF |

## 1.13 Fuente de información web considerada

**Open Food Facts** (base de datos abierta y colaborativa de productos alimenticios) mediante su **API REST oficial v2** y, complementariamente, **Open Prices** (precios colaborativos). Detalle en [04-fuente-web.md](04-fuente-web.md).

## 1.14 Capacidad adaptativa o inteligente propuesta

**SmartMatch**: motor híbrido de recomendación **multicriterio, basado en reglas y aprendizaje de preferencias**, implementado en el servicio Python. Combina filtros duros (alérgenos, dieta, sellos), puntuación ponderada por criterio con pesos del usuario, afinidad aprendida de las interacciones con decaimiento temporal y explicación por criterio. Detalle en [05-motor-smartmatch.md](05-motor-smartmatch.md).

## 1.15 ¿Cómo se determinará si el proyecto resolvió el problema?

| Dimensión | Métrica | Meta |
|---|---|---|
| Calidad de datos | % registros válidos, % duplicados, cobertura de campos clave | ≥ 90 %, < 5 %, ≥ 80 % |
| Relevancia | Precision@5 y nDCG@10 vs. versión base no adaptativa | +20 % |
| Utilidad percibida | Encuesta post-tarea (escala 1–5) | ≥ 4,0 |
| Comprensión | "Entiendo por qué se recomendó" (1–5) | ≥ 4,0 |
| Eficiencia | Tiempo para elegir entre 3 productos | −50 % vs. sin la app |
| Calidad técnica | Cobertura de pruebas, p95 de latencia de recomendaciones | ≥ 70 %, < 800 ms |
| Accesibilidad | Auditoría Lighthouse/axe | ≥ 90, sin errores críticos |

## 1.16 Respuesta preliminar a la pregunta integradora

1. **¿Qué problema real resuelve y quiénes son sus usuarios?** Elegir productos de supermercado equilibrando calidad, precio, disponibilidad y preferencias; consumidores en Chile (sección 1.5).
2. **¿Qué información obtiene desde la Web y cómo garantiza su calidad, procedencia y actualización?** Productos y precios de Open Food Facts/Open Prices vía API oficial; validación con esquemas Pydantic, normalización, deduplicación por GTIN, hash del registro crudo, fecha de obtención y licencia por registro; actualización incremental programada.
3. **¿Qué comportamiento adapta, con qué variables y mecanismo?** El orden y la selección de recomendaciones y el ganador de las comparaciones; variables: pesos declarados, dietas, alérgenos, sellos, interacciones; mecanismo: scoring multicriterio explicable + afinidad aprendida.
4. **¿Cómo se construye, prueba, despliega y monitorea de forma reproducible?** Docker/Docker Compose, pipeline DevSecOps en GitHub Actions con quality gates, Terraform para staging, logs estructurados con request-id y endpoints de salud.
5. **¿Qué evidencia demuestra que es útil, segura, accesible y responsable?** Métricas de la sección 1.15, reportes del pipeline (SAST, dependencias, secretos, imágenes), modelo de amenazas y evaluación con usuarios.
