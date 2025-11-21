/**
 * Mysic (Versión 0.2.1 - GLASS & PERFORMANCE FINAL)
 * - Scroll Infinito (Rendimiento extremo).
 * - Media Session API (Controles Android).
 * - Estética Glassmorphism en elementos dinámicos.
 * - Fix de carátulas y estabilidad.
 */
class Mysic {
    constructor() {
        this.DB_NAME = 'MysicDB';
        this.STORE_NAME = 'tracks';
        this.DB_VERSION = 5;

        this.db = null;
        this.jsmediatags = window.jsmediatags;
        this.colorThief = window.ColorThief ? new window.ColorThief() : null;
        
        this.currentAudioUrl = null;
        this.currentImageUrls = new Set();
        
        // --- ESTADO DEL RENDERIZADO (Scroll Infinito) ---
        this.observer = null;
        this.sentinel = null;
        this.renderState = {
            items: [],      
            nextIndex: 0,
            batchSize: 30,
            container: null,
            renderer: null
        };

        this.currentLibraryFilter = { type: 'albums', value: null, filterKey: null };
        
        // --- ESTADO DE REPRODUCCIÓN ---
        this.playlist = []; // Cola de reproducción
        this.currentIndex = -1;
        this.currentTrackId = null;
        this.allTracksCache = [];
        this.currentTrackType = 'local';
        this.navigationStack = ['home'];
        
        // Radios
        this.radioStations = [
            { 
                id: 'radio_usagi', title: 'USAgiFM', artist: 'Asian Hits / Anime', 
                art: 'https://sintonizaradio.com/wp-content/uploads/2023/05/usagifm-logo.jpeg', 
                type: 'webview', embedUrl: 'https://sintonizaradio.com/estaciones/usagifm/embed/playerbig/?theme=dark'
            },
            { 
                id: 'radio_w', title: 'W Radio', artist: 'Noticias', 
                art: 'https://placehold.co/300x300/10b981/white?text=W', 
                streamUrl: 'https://26673.live.streamtheworld.com/WRADIOAAC_SC' 
            },
            { 
                id: 'radio_classic', title: 'Classic FM', artist: 'Clásica', 
                art: 'https://placehold.co/300x300/eab308/white?text=Classic', 
                streamUrl: 'https://media-ssl.musicradio.com/ClassicFMMP3' 
            }
        ];

        this.elements = {};
        this.bindDOMElements();
        this.initObserver();
        this.initMediaSession(); // Android Controls
    }

    // --- MEDIA SESSION API (ANDROID LOCKSCREEN) ---
    initMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
            navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (this.elements.audioPlayer) {
                    this.elements.audioPlayer.currentTime = details.seekTime;
                }
            });
        }
    }

    updateMediaSessionMetadata(title, artist, artwork) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                artwork: [
                    { src: artwork, sizes: '96x96', type: 'image/png' },
                    { src: artwork, sizes: '128x128', type: 'image/png' },
                    { src: artwork, sizes: '192x192', type: 'image/png' },
                    { src: artwork, sizes: '512x512', type: 'image/png' },
                ]
            });
        }
    }

    // --- LÓGICA SIGUIENTE / ANTERIOR ---
    playNext() {
        if (this.playlist.length === 0) return;
        let nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.playlist.length) nextIndex = 0; // Loop
        this.playTrackByIndex(nextIndex);
    }

    playPrevious() {
        if (this.playlist.length === 0) return;
        // Si la canción lleva más de 3 seg, reiniciar
        if (this.elements.audioPlayer.currentTime > 3) {
            this.elements.audioPlayer.currentTime = 0;
            return;
        }
        let prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.playTrackByIndex(prevIndex);
    }

    async playTrackByIndex(index) {
        const track = this.playlist[index];
        if (track) {
            this.currentIndex = index;
            await this.playTrackInternal(track);
        }
    }

    // --- SCROLL INFINITO ---
    initObserver() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const options = { root: mainContent, rootMargin: '400px', threshold: 0.1 };

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                requestAnimationFrame(() => this.renderBatch());
            }
        }, options);
    }

    setupSentinel(container) {
        if (!container) return;
        if (this.sentinel) this.sentinel.remove();
        
        this.sentinel = document.createElement('div');
        this.sentinel.id = 'scroll-sentinel';
        this.sentinel.className = 'w-full h-16 flex items-center justify-center text-zinc-600 text-xs opacity-50';
        this.sentinel.textContent = ''; 
        container.appendChild(this.sentinel);
        this.observer.observe(this.sentinel);
    }

    renderBatch() {
        const { items, nextIndex, batchSize, container, renderer } = this.renderState;
        if (!items || !Array.isArray(items)) return;

        if (nextIndex >= items.length) {
            if (this.sentinel) {
                this.observer.unobserve(this.sentinel);
                this.sentinel.innerHTML = items.length > 0 ? '<div class="pb-20 opacity-30">Fin de la lista</div>' : '';
            }
            return;
        }

        const batch = items.slice(nextIndex, nextIndex + batchSize);
        this.renderState.nextIndex += batchSize;

        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');

        batch.forEach(item => {
            if (item) {
                try {
                    tempDiv.innerHTML = renderer(item);
                    if (tempDiv.firstElementChild) {
                        fragment.appendChild(tempDiv.firstElementChild);
                    }
                } catch (err) { console.error(err); }
            }
        });

        if (container && this.sentinel) container.insertBefore(fragment, this.sentinel);
    }

    // --- BASE DE DATOS ---
    initDB() {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        request.onerror = (e) => console.error("Error DB:", e);
        request.onupgradeneeded = (e) => {
            this.db = e.target.result;
            let store;
            if (!this.db.objectStoreNames.contains(this.STORE_NAME)) {
                store = this.db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
            } else {
                store = e.target.transaction.objectStore(this.STORE_NAME);
            }
            if (!store.indexNames.contains('artist')) store.createIndex('artist', 'artist', { unique: false });
            if (!store.indexNames.contains('album')) store.createIndex('album', 'album', { unique: false });
        };
        request.onsuccess = async (e) => {
            this.db = e.target.result;
            try {
                await this.updateAllTracksCache();
                this.showHome(null);
            } catch(err) { console.error(err); }
        };
    }

    addTracksToDB(tracks) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("DB no lista");
            const tx = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            tracks.forEach(track => store.add(track));
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    getAllTracks(filter = null) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve([]);
            const tx = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const tracks = [];
            let request;
            try {
                if (filter?.artist) request = store.index('artist').openCursor(IDBKeyRange.only(filter.artist));
                else if (filter?.album) request = store.index('album').openCursor(IDBKeyRange.only(filter.album));
                else request = store.openCursor(null, 'prev');
            } catch (err) { request = store.openCursor(); }
            
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    let match = true;
                    const val = cursor.value || {};
                    if (filter?.artist && val.artist !== filter.artist) match = false;
                    if (filter?.album && val.album !== filter.album) match = false;
                    if (match) tracks.push(val);
                    cursor.continue();
                } else { resolve(tracks); }
            };
            request.onerror = () => resolve([]);
        });
    }

    async updateAllTracksCache() {
        this.allTracksCache = await this.getAllTracks();
        if (!Array.isArray(this.allTracksCache)) this.allTracksCache = [];
    }

    // --- BIBLIOTECA ---
    async loadLibrary(filterConfig) {
        const { type, value, filterKey } = filterConfig || { type: 'albums', value: null, filterKey: null };
        
        this.cleanupImageUrls();
        if(this.elements.libraryContent) this.elements.libraryContent.innerHTML = '';
        this.currentLibraryFilter = { type, value, filterKey };
        this.setActiveFilterButton(type);
        
        let title = "Biblioteca";
        let subFilter = null;

        if (filterKey === 'artist' && value) {
            title = value;
            subFilter = { artist: value };
            this.elements.clearFilterBtn.classList.remove('hidden');
        } else if (filterKey === 'album' && value) {
            title = value;
            subFilter = { album: value };
            this.elements.clearFilterBtn.classList.remove('hidden');
        } else {
            this.elements.clearFilterBtn.classList.add('hidden');
        }
        
        if(this.elements.libraryTitle) this.elements.libraryTitle.textContent = title;

        const tracks = await this.getAllTracks(subFilter);

        // Actualizar Playlist global si es vista de canciones
        if (type === 'songs') this.playlist = tracks;

        if (!tracks || tracks.length === 0) {
            this.elements.libraryContent.innerHTML = `
                <div class="text-center py-20">
                    <p class="text-white/40 text-lg mb-4">No hay música aquí.</p>
                    <button class="text-purple-300 text-sm border border-purple-500/30 px-4 py-2 rounded-full hover:bg-purple-500/10" 
                            onclick="document.getElementById('add-music-btn').click()">Añadir canciones</button>
                </div>`;
            return;
        }

        let itemsToRender = [];
        let rendererFunction = null;

        if (type === 'songs') {
            tracks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            itemsToRender = tracks;
            rendererFunction = (t) => this.getTrackHTML(t);
        } else if (type === 'artists') {
            const groups = this.groupBy(tracks, 'artist');
            itemsToRender = Object.keys(groups).sort().map(artist => ({ name: artist, tracks: groups[artist] }));
            rendererFunction = (item) => this.getArtistHTML(item.name, item.tracks);
        } else if (type === 'albums') {
            const groups = this.groupBy(tracks, 'album');
            itemsToRender = Object.keys(groups).sort().map(album => ({ name: album, tracks: groups[album] }));
            rendererFunction = (item) => this.getAlbumHTML(item.name, item.tracks);
        }

        this.renderState = {
            items: itemsToRender || [],
            nextIndex: 0,
            batchSize: 30, 
            container: this.elements.libraryContent,
            renderer: rendererFunction
        };

        this.setupSentinel(this.elements.libraryContent);
        this.renderBatch();
    }

    // --- HTML GENERATORS (GLASSMORPHISM) ---
    getTrackHTML(track) {
        if (!track) return '';
        const title = this.escapeHTML(track.title || 'Desconocido');
        const artist = this.escapeHTML(track.artist || 'Desconocido');
        const img = this.createImageUrl(track.picture, track.title);
        
        return `
            <div class="track-item group flex items-center space-x-4 p-3 rounded-2xl cursor-pointer active:scale-95 transition-all duration-200 hover:bg-white/5 border border-transparent hover:border-white/5"
                 data-track-id="${track.id}" 
                 data-title="${title}" 
                 data-artist="${artist}"
                 data-image-url="${img}">
                <img src="${img}" class="w-12 h-12 rounded-xl bg-white/5 object-cover shadow-sm group-hover:shadow-md transition-shadow" loading="lazy">
                <div class="flex-1 min-w-0">
                    <h3 class="text-white/90 font-bold truncate text-sm">${title}</h3>
                    <p class="text-white/50 text-xs truncate mt-0.5">${artist}</p>
                </div>
                <button class="p-2 text-white/20 hover:text-white transition-colors rounded-full hover:bg-white/10"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></button>
            </div>`;
    }

    getArtistHTML(artist, tracks) {
        if (!tracks) return '';
        const trackWithPic = tracks.find(t => t.picture);
        const img = this.createImageUrl(trackWithPic?.picture, artist);
        const name = this.escapeHTML(artist || 'Desconocido');
        const count = tracks.length || 0;

        return `
            <div class="artist-item flex items-center space-x-4 p-4 rounded-3xl cursor-pointer glass-panel active:scale-95 transition-transform duration-200"
                 data-artist-name="${name}">
                <img src="${img}" class="w-14 h-14 rounded-full bg-black/30 object-cover shadow-lg border border-white/10" loading="lazy">
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-bold truncate text-base">${name}</h3>
                    <p class="text-purple-300/80 text-xs font-medium uppercase tracking-wider">${count} tracks</p>
                </div>
                <svg class="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </div>`;
    }

    getAlbumHTML(album, tracks) {
        if (!tracks) return '';
        const trackWithPic = tracks.find(t => t.picture);
        const img = this.createImageUrl(trackWithPic?.picture, album);
        const name = this.escapeHTML(album || 'Desconocido');
        const artist = this.escapeHTML(tracks[0]?.artist || 'Varios');

        return `
            <div class="album-item p-4 rounded-3xl cursor-pointer glass-panel active:scale-95 transition-transform duration-200 flex flex-col"
                 data-album-name="${name}">
                <img src="${img}" class="w-full aspect-square rounded-2xl bg-black/30 object-cover shadow-lg mb-3 border border-white/5" loading="lazy">
                <h3 class="text-white font-bold truncate text-sm">${name}</h3>
                <p class="text-white/50 text-xs truncate">${artist}</p>
            </div>`;
    }

    // --- NAVEGACIÓN ---
    showHome(e) { if(e) e.preventDefault(); this.navigate('home'); }
    showLibrary(e) { if(e) e.preventDefault(); this.navigate('library'); }
    showRadios(e) { if(e) e.preventDefault(); this.navigate('radios'); }
    showSearch(e) { if(e) e.preventDefault(); this.navigate('search'); }

    navigate(viewName) {
        ['view-home', 'view-library', 'view-radios', 'view-search'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.add('hidden');
        });
        const target = document.getElementById(`view-${viewName}`);
        if(target) target.classList.remove('hidden');
        
        this.elements.allNavButtons.forEach(btn => {
            btn.classList.remove('text-white', 'scale-110');
            btn.classList.add('text-white/50');
        });
        
        // Highlight activo con efecto
        if(viewName === 'home') this.highlightNav(this.elements.homeButtons);
        if(viewName === 'library') this.highlightNav(this.elements.libButtons);
        if(viewName === 'radios') this.highlightNav(this.elements.radiosButtons);

        if(viewName === 'library') this.loadLibrary(this.currentLibraryFilter);
        if(viewName === 'home') this.loadHomeContent();
        if(viewName === 'radios') this.loadRadios();
        if(viewName === 'search') setTimeout(() => this.elements.searchInput.focus(), 100);

        if(this.navigationStack[this.navigationStack.length-1] !== viewName) {
            this.navigationStack.push(viewName);
        }
    }

    highlightNav(btns) {
        btns.forEach(b => {
            if(b) {
                b.classList.remove('text-white/50');
                b.classList.add('text-white', 'scale-110');
            }
        });
    }

    setActiveFilterButton(type) {
        if (!this.currentLibraryFilter.value) {
            ['albums', 'artists', 'songs'].forEach(key => {
                const btn = this.elements.filterButtons[key];
                if (btn) {
                    if (key === type) {
                        btn.classList.add('active', 'bg-white', 'text-black', 'shadow-lg', 'border-transparent');
                        btn.classList.remove('inactive', 'bg-white/5', 'text-white/70', 'border-white/5');
                    } else {
                        btn.classList.add('inactive', 'bg-white/5', 'text-white/70', 'border', 'border-white/5');
                        btn.classList.remove('active', 'bg-white', 'text-black', 'shadow-lg', 'border-transparent');
                    }
                }
            });
        }
    }

    // --- REPRODUCTOR INTERNO (UNIFICADO) ---
    async playTrackInternal(track) {
        if(!track) return;
        this.currentTrackId = track.id;
        this.currentTrackType = 'local';
        
        const title = track.title || 'Desconocido';
        const artist = track.artist || 'Desconocido';
        const img = this.createImageUrl(track.picture, track.title);
        
        this.updatePlayerUI(title, artist, img);
        this.updateMediaSessionMetadata(title, artist, img); 
        
        const progContainer = document.getElementById('progress-container');
        if(progContainer) progContainer.style.opacity = '1';

        try {
            const file = track.file || await this.getTrackFile(track.id);
            if(!file) throw new Error("Archivo no encontrado");

            if (this.currentAudioUrl) URL.revokeObjectURL(this.currentAudioUrl);
            this.currentAudioUrl = URL.createObjectURL(file);
            this.elements.audioPlayer.src = this.currentAudioUrl;
            await this.elements.audioPlayer.play();
            this.updatePlayPauseIcon(false);
        } catch (e) {
            console.error(e);
            this.showNotification("Error", "No se pudo reproducir", "error");
        }
    }

    // Handler de click (Detecta si viene de Recent o Library)
    async playTrack(itemData) {
        const id = Number(itemData.dataset?.trackId || itemData.id);
        if(!id) return;

        // Buscar en caché
        let track = this.allTracksCache.find(t => t.id === id);
        
        // Si no está en caché (fallback), reconstruir del DOM
        if (!track) {
            track = {
                id: id,
                title: itemData.dataset?.title,
                artist: itemData.dataset?.artist,
                // La imagen se gestionará al cargar el archivo
            };
        }

        // Configurar Playlist si es necesario
        if (this.playlist.length === 0 || !this.playlist.find(t => t.id === id)) {
            this.playlist = this.allTracksCache;
        }
        this.currentIndex = this.playlist.findIndex(t => t.id === id);

        await this.playTrackInternal(track);
    }

    playRadio(radioItem) {
        if(!navigator.onLine) return this.showNotification("Sin conexión", "Necesitas internet", "error");
        this.currentTrackType = 'radio';
        this.currentTrackId = null;
        this.playlist = []; 
        
        const progContainer = document.getElementById('progress-container');
        if(progContainer) progContainer.style.opacity = '0';
        
        const { url, title, artist, art } = radioItem.dataset;
        this.updatePlayerUI(title, artist, art);
        this.updateMediaSessionMetadata(title, artist, art);
        
        this.elements.audioPlayer.src = url;
        this.elements.audioPlayer.play().catch(e => {
            this.showNotification("Error", "No se pudo conectar a la radio", "error");
        });
        this.updatePlayPauseIcon(false);
    }

    // --- UTILIDADES ---
    groupBy(arr, key) {
        if(!Array.isArray(arr)) return {};
        return arr.reduce((rv, x) => {
            const v = x[key] || 'Desconocido';
            (rv[v] = rv[v] || []).push(x);
            return rv;
        }, {});
    }

    createImageUrl(blob, char) {
        if (blob) {
            const url = URL.createObjectURL(blob);
            this.currentImageUrls.add(url);
            return url;
        }
        const safeChar = String(char || '?').charAt(0).toUpperCase();
        return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%2318181b'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='50' font-family='sans-serif'>${safeChar}</text></svg>`;
    }

    cleanupImageUrls() {
        this.currentImageUrls.forEach(u => URL.revokeObjectURL(u));
        this.currentImageUrls.clear();
    }

    escapeHTML(str) {
        if(!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    togglePlayPause() {
        const p = this.elements.audioPlayer;
        if(p.paused) {
            p.play().catch(e => console.log(e));
            this.updatePlayPauseIcon(false);
            if('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        } else {
            p.pause();
            this.updatePlayPauseIcon(true);
            if('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
        }
    }

    updatePlayPauseIcon(paused) {
        const p = paused ? 'block' : 'none';
        const s = paused ? 'none' : 'block';
        if(this.elements.iconPlay) this.elements.iconPlay.style.display = p;
        if(this.elements.iconPause) this.elements.iconPause.style.display = s;
        if(this.elements.iconFullPlay) this.elements.iconFullPlay.style.display = p;
        if(this.elements.iconFullPause) this.elements.iconFullPause.style.display = s;
    }
    
    updatePlayerUI(t, a, i) {
        if(this.elements.playerTitle) this.elements.playerTitle.textContent = t;
        if(this.elements.playerArtist) this.elements.playerArtist.textContent = a;
        if(this.elements.playerArt) this.elements.playerArt.src = i;
        if(this.elements.playerFullTitle) this.elements.playerFullTitle.textContent = t;
        if(this.elements.playerFullArtist) this.elements.playerFullArtist.textContent = a;
        if(this.elements.playerFullArt) this.elements.playerFullArt.src = i;
        
        // Efecto de color dinámico en el fondo del player
        if(this.colorThief && this.elements.playerFullArt.complete) {
            try {
                const c = this.colorThief.getColor(this.elements.playerFullArt);
                const bg = document.getElementById('player-bg-gradient');
                if(bg) {
                    bg.style.background = `linear-gradient(to bottom, rgba(${c[0]},${c[1]},${c[2]}, 0.8), #000000)`;
                }
            } catch(e) { }
        }
    }

    bindDOMElements() {
        const getId = (id) => document.getElementById(id);
        this.elements = {
            libraryContent: getId('library-content'),
            libraryTitle: getId('library-title'),
            clearFilterBtn: getId('clear-filter-btn'),
            filterButtons: {
                albums: getId('filter-albums'),
                artists: getId('filter-artists'),
                songs: getId('filter-songs')
            },
            homeButtons: [getId('btn-sidebar-home'), getId('btn-tab-home')],
            libButtons: [getId('btn-sidebar-lib'), getId('btn-tab-lib')],
            radiosButtons: [getId('btn-sidebar-radios'), getId('btn-tab-radios')],
            allNavButtons: Array.from(document.querySelectorAll('nav button, nav a')),
            searchInput: getId('search-input'),
            searchResults: getId('search-results'),
            
            audioPlayer: getId('audio-player'),
            fullPlayerView: getId('full-player-view'),
            playerTitle: getId('player-title'),
            playerArtist: getId('player-artist'),
            playerArt: getId('player-art'),
            playerFullTitle: getId('player-full-title'),
            playerFullArtist: getId('player-full-artist'),
            playerFullArt: getId('player-full-art'),
            iconPlay: getId('icon-play'),
            iconPause: getId('icon-pause'),
            iconFullPlay: getId('icon-full-play'),
            iconFullPause: getId('icon-full-pause'),
        };

        // Listeners seguros
        this.elements.homeButtons.forEach(b => b?.addEventListener('click', (e) => this.showHome(e)));
        this.elements.libButtons.forEach(b => b?.addEventListener('click', (e) => this.showLibrary(e)));
        this.elements.radiosButtons.forEach(b => b?.addEventListener('click', (e) => this.showRadios(e)));

        this.elements.filterButtons.albums?.addEventListener('click', () => this.loadLibrary({ type: 'albums' }));
        this.elements.filterButtons.artists?.addEventListener('click', () => this.loadLibrary({ type: 'artists' }));
        this.elements.filterButtons.songs?.addEventListener('click', () => this.loadLibrary({ type: 'songs' }));
        this.elements.clearFilterBtn?.addEventListener('click', () => this.loadLibrary({ type: 'albums' }));

        this.elements.libraryContent?.addEventListener('click', (e) => this.handleContentClick(e));
        document.getElementById('home-recent')?.addEventListener('click', (e) => this.handleContentClick(e));
        this.elements.searchResults?.addEventListener('click', (e) => this.handleContentClick(e));
        
        document.getElementById('radios-list')?.addEventListener('click', (e) => {
            const item = e.target.closest('.radio-item');
            if(item && item.dataset.type !== 'webview') this.playRadio(item);
        });

        getId('add-music-btn')?.addEventListener('click', () => getId('add-music-modal').classList.remove('hidden'));
        getId('close-modal-btn')?.addEventListener('click', () => getId('add-music-modal').classList.add('hidden'));
        getId('upload-local-btn')?.addEventListener('click', () => getId('file-input').click());
        getId('file-input')?.addEventListener('change', (e) => this.handleFileUpload(e));

        const toggle = (e) => { e.stopPropagation(); this.togglePlayPause(); };
        getId('play-pause-btn')?.addEventListener('click', toggle);
        getId('player-full-play-pause-btn')?.addEventListener('click', toggle);
        
        // Botones Next/Prev
        getId('player-next-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.playNext(); });
        getId('player-prev-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.playPrevious(); });

        getId('now-playing-bar')?.addEventListener('click', () => {
            if(this.elements.fullPlayerView) this.elements.fullPlayerView.style.transform = 'translateY(0)';
        });
        getId('close-player-btn')?.addEventListener('click', () => {
            if(this.elements.fullPlayerView) this.elements.fullPlayerView.style.transform = 'translateY(100%)';
        });
        
        this.elements.audioPlayer?.addEventListener('timeupdate', () => {
            const p = this.elements.audioPlayer;
            const bar = document.getElementById('progress-bar');
            const curTime = document.getElementById('current-time');
            const durTime = document.getElementById('duration');
            
            if(p.duration && bar) {
                const pct = (p.currentTime / p.duration) * 100;
                bar.style.width = pct + '%';
                if(curTime) curTime.textContent = this.formatTime(p.currentTime);
                if(durTime) durTime.textContent = this.formatTime(p.duration);
            }
        });

        this.elements.audioPlayer?.addEventListener('ended', () => {
            if(this.currentTrackType === 'local') this.playNext();
        });
        
        document.getElementById('progress-bar-container')?.addEventListener('click', (e) => {
            const rect = e.target.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if(this.elements.audioPlayer && this.elements.audioPlayer.duration) {
                this.elements.audioPlayer.currentTime = pct * this.elements.audioPlayer.duration;
            }
        });
        
        this.elements.searchInput?.addEventListener('input', () => {
            const term = this.elements.searchInput.value.toLowerCase();
            const res = this.elements.searchResults;
            if(!res) return;
            res.innerHTML = '';
            if(term.length < 1) return res.innerHTML = '';
            
            const results = this.allTracksCache.filter(t => 
                (t.title && t.title.toLowerCase().includes(term)) || 
                (t.artist && t.artist.toLowerCase().includes(term))
            );
            
            results.slice(0, 20).forEach(t => {
                res.innerHTML += this.getTrackHTML(t);
            });
        });
        
        getId('global-search-btn')?.addEventListener('click', (e) => this.showSearch(e));
        getId('back-from-search')?.addEventListener('click', () => this.showHome(null));
    }

    async handleContentClick(e) {
        const track = e.target.closest('.track-item');
        const artist = e.target.closest('.artist-item');
        const album = e.target.closest('.album-item');

        if (track) this.playTrack(track);
        else if (artist) this.loadLibrary({ type: 'songs', value: artist.dataset.artistName, filterKey: 'artist' });
        else if (album) this.loadLibrary({ type: 'songs', value: album.dataset.albumName, filterKey: 'album' });
    }

    async handleFileUpload(e) {
        const files = Array.from(e.target.files);
        if(!files.length) return;
        
        const status = document.getElementById('modal-status');
        if(status) status.textContent = "Leyendo archivos...";
        
        const tracks = await Promise.all(files.map(f => this.parseFile(f)));
        
        if(status) status.textContent = "Guardando...";
        await this.addTracksToDB(tracks);
        await this.updateAllTracksCache();
        
        document.getElementById('add-music-modal').classList.add('hidden');
        this.loadHomeContent();
        this.loadLibrary(this.currentLibraryFilter);
    }

    parseFile(file) {
        return new Promise(resolve => {
            if(!this.jsmediatags) {
                return resolve({ title: file.name, artist: 'Desc', album: 'Desc', file });
            }
            this.jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const tags = tag && tag.tags ? tag.tags : {};
                    const p = tags.picture;
                    let blob = null;
                    if(p) blob = new Blob([new Uint8Array(p.data)], { type: p.format });
                    
                    resolve({
                        title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
                        artist: tags.artist || "Desconocido",
                        album: tags.album || "Desconocido",
                        picture: blob,
                        file: file
                    });
                },
                onError: () => resolve({ title: file.name, artist: 'Desconocido', album: 'Desconocido', file })
            });
        });
    }
    
    getTrackFile(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.STORE_NAME], 'readonly');
            const req = tx.objectStore(this.STORE_NAME).get(id);
            req.onsuccess = () => resolve(req.result?.file);
            req.onerror = () => reject();
        });
    }

    loadHomeContent() { this.loadHomeRecent(); }
    
    async loadHomeRecent() {
        const c = document.getElementById('home-recent');
        if(!c) return;
        
        c.innerHTML = '';
        const tracks = await this.getAllTracks();
        
        const emptyMsg = document.getElementById('home-recent-empty');
        if(!tracks || tracks.length === 0) {
            if(emptyMsg) emptyMsg.classList.remove('hidden');
            return;
        }
        if(emptyMsg) emptyMsg.classList.add('hidden');
        
        // --- FIX DE CARÁTULA EN HOME ---
        // Aquí usamos getTrackHTML adaptado o construimos manualmente asegurando 'data-image-url'
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        tracks.slice(0, 10).forEach(t => {
            const img = this.createImageUrl(t.picture, t.title);
            // AÑADIDO DATA-IMAGE-URL PARA QUE EL PLAYER LO LEA
            tempDiv.innerHTML = `
                <div class="track-item flex-shrink-0 w-28 md:w-36 cursor-pointer mr-4 group" 
                     data-track-id="${t.id}" 
                     data-title="${this.escapeHTML(t.title)}" 
                     data-artist="${this.escapeHTML(t.artist)}"
                     data-image-url="${img}">
                    <img src="${img}" class="w-full aspect-square rounded-2xl bg-white/5 object-cover mb-3 shadow-lg group-hover:scale-105 transition-transform duration-300 border border-white/5" loading="lazy">
                    <p class="text-white/90 text-xs font-bold truncate px-1">${this.escapeHTML(t.title)}</p>
                    <p class="text-white/50 text-[10px] truncate px-1 pb-1">${this.escapeHTML(t.artist)}</p>
                </div>`;
            if(tempDiv.firstElementChild) fragment.appendChild(tempDiv.firstElementChild);
        });
        c.appendChild(fragment);
    }

    loadRadios() {
        const list = document.getElementById('radios-list');
        const feat = document.getElementById('featured-radio-container');
        if(!list) return;
        list.innerHTML = ''; feat.innerHTML = '';
        
        this.radioStations.forEach(s => {
            if(s.type === 'webview') {
                feat.innerHTML = `<div class="usagi-radio w-full glass-panel rounded-3xl overflow-hidden mb-6 border border-white/10 shadow-2xl">
                    <div class="p-5 flex items-center gap-4 bg-black/20 backdrop-blur-md">
                        <img src="${s.art}" class="w-14 h-14 rounded-2xl border border-white/10 shadow-lg">
                        <div>
                            <h3 class="font-bold text-white text-lg tracking-tight">${s.title}</h3>
                            <p class="text-purple-400 text-xs font-bold uppercase tracking-widest flex items-center"><span class="w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></span>En vivo</p>
                        </div>
                    </div>
                    <div class="h-[200px] md:h-[300px] bg-black relative">
                        ${navigator.onLine ? `<iframe src="${s.embedUrl}" class="w-full h-full border-0 relative z-10"></iframe>` : '<div class="flex h-full items-center justify-center text-white/30 text-sm">Sin conexión</div>'}
                    </div>
                </div>`;
            } else {
                list.insertAdjacentHTML('beforeend', `
                    <div class="radio-item glass-panel p-4 rounded-3xl cursor-pointer transition-all active:scale-95 hover:bg-white/5" 
                         data-url="${s.streamUrl}" 
                         data-title="${s.title}" 
                         data-artist="${s.artist}" 
                         data-art="${s.art}">
                        <div class="relative aspect-square mb-3 group">
                            <img src="${s.art}" class="w-full h-full rounded-2xl object-cover bg-black/50 shadow-lg border border-white/5" loading="lazy">
                            <div class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                                <div class="bg-white/20 backdrop-blur-sm p-3 rounded-full border border-white/20">
                                    <svg class="w-6 h-6 text-white fill-current" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                                </div>
                            </div>
                        </div>
                        <p class="text-white font-bold text-sm truncate px-1">${s.title}</p>
                        <p class="text-white/50 text-xs truncate px-1">${s.artist}</p>
                    </div>
                `);
            }
        });
    }
    
    formatTime(s) { 
        if(!s || isNaN(s)) return "0:00";
        return Math.floor(s/60) + ':' + ('0'+Math.floor(s%60)).slice(-2); 
    }
    
    showNotification(t, m, type) { 
        const n = document.getElementById('global-notification');
        if(!n) return;
        const title = document.getElementById('notification-title');
        const msg = document.getElementById('notification-message');
        if(title) title.textContent = t;
        if(msg) msg.textContent = m;
        
        n.classList.remove('hidden', 'translate-y-[-150%]');
        setTimeout(() => { 
            n.classList.add('translate-y-[-150%]'); 
            setTimeout(() => n.classList.add('hidden'), 500); 
        }, 3000);
    }

    init() { this.initDB(); }
}

document.addEventListener('DOMContentLoaded', () => { const app = new Mysic(); app.init(); });