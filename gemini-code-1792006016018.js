// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Referencias DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnRead = document.getElementById('btn-read');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const currentPageElem = document.getElementById('current-page');
const totalPagesElem = document.getElementById('total-pages');
const srAnnouncer = document.getElementById('sr-announcer');

let pageFlip = null;
let pdfDoc = null;
let pagesText = []; // Para almacenar el texto extraído de cada página (lectura TTS)
let currentZoom = 1.0;
let synth = window.speechSynthesis;

// 1. Carga automática del archivo "cuento.pdf" del repositorio
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF('cuento.pdf');
});

async function loadRepoPDF(url) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';

    try {
        pdfDoc = await pdfjsLib.getDocument(url).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesElem.textContent = totalPages;

        const firstPage = await pdfDoc.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        bookContainer.innerHTML = '';

        // Procesar páginas
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            // Extraer texto para la lectura en voz alta
            const textContent = await page.getTextContent();
            const pageString = textContent.items.map(item => item.str).join(' ');
            pagesText.push(pageString || `Página ${pageNum} sin texto accesible.`);

            // Crear canvas para el flipbook
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.setAttribute('role', 'region');
            pageDiv.setAttribute('aria-label', `Página ${pageNum}`);
            pageDiv.appendChild(canvas);

            bookContainer.appendChild(pageDiv);
        }

        // Inicializar FlipBook con PageFlip
        bookContainer.style.display = 'block';
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 280,
            maxWidth: pageWidth * 1.2,
            minHeight: 380,
            maxHeight: pageHeight * 1.2,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos de cambio de página
        pageFlip.on('flip', (e) => {
            playPageTurnSound();
            if (synth.speaking) synth.cancel(); // Detener lectura al pasar página
            updatePageInfo(e.data + 1);
        });

        updatePageInfo(1);
        loading.style.display = 'none';

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'No se pudo cargar el archivo cuento.pdf desde el repositorio. Verifica que el archivo exista en la raíz del proyecto.';
    }
}

// Actualizar indicadores y lector de pantalla
function updatePageInfo(pageNum) {
    currentPageElem.textContent = pageNum;
    const message = `Página ${pageNum} de ${pdfDoc ? pdfDoc.numPages : 0}`;
    announceScreenReader(message);
}

// Anuncio para lectores de pantalla
function announceScreenReader(text) {
    srAnnouncer.textContent = text;
}

// 5. Efecto de Sonido Sintetizado al pasar página (Web Audio API)
function playPageTurnSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15; // 150 ms
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generar ruido blanco suave simulando roce de hoja
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        console.log("Audio no soportado o desactivado por interacción de usuario.");
    }
}

// 4. Botones de Navegación
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

// 3. Lectura en voz alta (Text-To-Speech en Español)
btnRead.addEventListener('click', () => {
    if (!synth) {
        alert('Tu navegador no soporta lectura en voz alta.');
        return;
    }

    if (synth.speaking) {
        synth.cancel();
        btnRead.textContent = '🔊 Leer Página';
        return;
    }

    const currentPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
    const textToRead = pagesText[currentPageIndex];

    if (textToRead) {
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'es-ES'; // Idioma Español
        utterance.rate = 0.9; // Velocidad ligeramente reducida para mejor comprensión

        utterance.onstart = () => {
            btnRead.textContent = '⏹️ Detener Lectura';
            announceScreenReader("Iniciando lectura en voz alta.");
        };

        utterance.onend = () => {
            btnRead.textContent = '🔊 Leer Página';
        };

        synth.speak(utterance);
    }
});

// 8 & 3. Botones para Agrandar y Achicar Vista / Texto
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.5) {
        currentZoom += 0.1;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.1;
        applyZoom();
    }
});

function applyZoom() {
    bookContainer.style.transform = `scale(${currentZoom})`;
    bookContainer.style.transformOrigin = 'top center';
    announceScreenReader(`Zoom ajustado al ${Math.round(currentZoom * 100)} por ciento`);
}

// Control mediante teclado para mayor accesibilidad
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
        if (pageFlip) pageFlip.flipNext();
    } else if (e.key === 'ArrowLeft') {
        if (pageFlip) pageFlip.flipPrev();
    }
});