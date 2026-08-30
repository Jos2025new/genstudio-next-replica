# Project TODO

- [x] Replicar el layout GenStudio oscuro con header, sidebar, panel central y área de resultados.
- [x] Implementar navegación entre Generación y Compositor.
- [x] Implementar selector de modelo con estado vacío y controles de creación.
- [x] Implementar editor de prompt con contador, borrado e historial de prompts reutilizables.
- [x] Implementar controles de aspecto, cantidad de resultados y parámetros visuales.
- [x] Implementar carga y gestión de imágenes de referencia para composición.
- [x] Implementar menú de configuración superior derecho para NanoGPT API Key.
- [x] Validar la API Key visualmente y mantenerla siempre enmascarada.
- [x] Permitir actualizar y eliminar la API Key guardada en sesión.
- [x] Conectar generación y composición con NanoGPT mediante backend seguro.
- [x] Implementar estados de carga, progreso, éxito y errores claros.
- [x] Implementar galería de resultados con vista previa y descarga.
- [x] Implementar historial de sesiones con reutilización de prompts.
- [x] Adaptar la experiencia a desktop, tablet y móvil.
- [x] Añadir pruebas unitarias para validación de API Key y estado de generación.
- [x] Ejecutar verificación TypeScript, tests y revisión visual responsive.

- [x] Añadir botón funcional para replegar y desplegar el panel izquierdo.
- [x] Eliminar el botón de navegación superior izquierdo no solicitado.
- [x] Mantener el panel central centrado y adaptarlo al ancho disponible al cambiar el sidebar.
- [x] Retirar del flujo los parámetros visuales no confirmados por la API de NanoGPT.
- [x] Convertir el selector de modelo en un panel desplegable con búsqueda y secciones Imagen/Video.

- [x] Añadir catálogo de modelos de vídeo con capacidades i2v desde NanoGPT.
- [x] Implementar envío de trabajos i2v por lote usando una imagen de referencia por trabajo.
- [x] Implementar consulta de estado de trabajos i2v y normalizar estados/completions.
- [x] Añadir controles de lote, duración, relación de aspecto y resolución según el modelo.
- [x] Mostrar progreso individual, errores y resultados de vídeo en la galería.
- [x] Añadir pruebas unitarias para envío y polling i2v.
- [x] Verificar el flujo i2v en desktop/móvil y guardar checkpoint.

- [x] Filtrar el selector de vídeo para mostrar solo modelos con capacidad image_to_video.
- [x] Derivar duración, relación de aspecto y límite de lote desde supported_parameters cuando estén disponibles.
- [x] Guardar un checkpoint nuevo posterior a los cambios i2v y verificar esa versión final.
