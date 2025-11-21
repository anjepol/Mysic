Mysic - Reproductor Offline PWA
Mysic es un reproductor de música web progresivo (PWA) diseñado para ofrecer una experiencia de audio local fluida, estética y 100% offline en dispositivos Android. Combina la potencia de las tecnologías web modernas con una interfaz de usuario estilo Glassmorphism de alta calidad.
🚀 Características Principales
 * 100% Offline: Funciona sin conexión a internet gracias a la implementación de Service Workers. Tu música y la aplicación viven en tu dispositivo.
 * Base de Datos Local: Utiliza IndexedDB para almacenar tus archivos de música de forma persistente en el navegador, sin necesidad de volver a subirlos.
 * Diseño Glassmorphism: Interfaz moderna con efectos de desenfoque, transparencias y texturas de ruido para una experiencia visual premium.
 * Scroll Infinito: Optimizado para manejar grandes bibliotecas de música sin sacrificar el rendimiento, cargando elementos bajo demanda.
 * Integración Nativa Android:
   * Controles de reproducción en la pantalla de bloqueo y barra de notificaciones (Media Session API).
   * Reproducción en segundo plano.
 * Extracción de Color: El fondo del reproductor se adapta dinámicamente a los colores de la carátula del álbum (ColorThief).
 * Soporte de Metadatos: Lee automáticamente títulos, artistas y portadas de tus archivos MP3, FLAC y M4A (jsmediatags).
🛠️ Tecnologías Utilizadas
 * HTML5 & CSS3: Estructura semántica y estilos avanzados.
 * JavaScript (Vanilla ES6+): Lógica de negocio sin frameworks pesados para máximo rendimiento.
 * Tailwind CSS: Utilizado para el diseño utilitario (versión standalone).
 * IndexedDB: Almacenamiento de archivos de audio y metadatos.
 * Service Workers: Gestión de caché y funcionalidad offline.
 * Librerías:
   * jsmediatags.min.js: Lectura de metadatos ID3.
   * color-thief.js: Extracción de paletas de colores de imágenes.
   * tailwindcss.js: Motor de estilos CSS.
📱 Instalación (Como App)
Mysic es una PWA, lo que significa que puedes instalarla directamente desde tu navegador sin necesidad de una tienda de aplicaciones.
En Android (Chrome):
 * Abre la aplicación en tu navegador Chrome.
 * Toca el menú de tres puntos en la esquina superior derecha.
 * Selecciona "Instalar aplicación" o "Añadir a pantalla de inicio".
 * ¡Listo! Mysic aparecerá en tu cajón de aplicaciones y funcionará como una app nativa.
Generar APK (Opcional)
Si prefieres un archivo .apk instalable, puedes utilizar servicios como PWABuilder:
 * Sube este código a un repositorio de GitHub y activa GitHub Pages.
 * Ingresa la URL de tu GitHub Page en PWABuilder.com.
 * Genera y descarga el paquete para Android.
📂 Estructura del Proyecto
/
├── index.html          # Estructura principal y UI
├── script.js           # Lógica del reproductor, DB y Media Session
├── style.css           # Estilos personalizados y efectos Glassmorphism
├── sw.js               # Service Worker para caché offline
├── manifest.json       # Configuración de PWA (iconos, nombre, colores)
├── tailwindcss.js      # Librería de estilos
├── jsmediatags.min.js  # Librería de metadatos
├── color-thief.js      # Librería de colores
├── icon-192.png        # Icono de aplicación (192px)
└── icon-512.png        # Icono de aplicación (512px)

🤝 Contribución
¡Las contribuciones son bienvenidas! Si tienes ideas para mejorar Mysic, siéntete libre de hacer un fork del repositorio y enviar un Pull Request.
📄 Licencia
Este proyecto es de código abierto y está disponible bajo la licencia MIT.
Desarrollado con ❤️ para los amantes de la música.
