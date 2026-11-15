(function () {
    'use strict';
    var REQUIRED = ['photo_id', 'filename', 'date', 'time', 'location'];
    var workMode = 'custom';
    var EXPORT_HEADERS = REQUIRED.concat(['coordinates']);
    var photos = [], nextId = 0, importRows = [], imported = false, generating = false, zipping = false, zipError = '', pdfExporting = false;
    var printState = { open: false, orientation: 'portrait', photosPerPage: 4, margin: 12, gap: 6, placements: [], selectedId: null, notice: '' };
    var el = { dropzone: document.getElementById('dropzone'), fileInput: document.getElementById('fileInput'), photoCount: document.getElementById('photoCount'), notice: document.getElementById('uploadNotice'), empty: document.getElementById('emptyState'), list: document.getElementById('photoList'), template: document.getElementById('photoTemplate'), exportButton: document.getElementById('exportButton'), csvInput: document.getElementById('csvInput'), importButton: document.getElementById('importButton'), importName: document.getElementById('importName'), summary: document.getElementById('summary'), sumUploaded: document.getElementById('sumUploaded'), sumMatched: document.getElementById('sumMatched'), sumErrors: document.getElementById('sumErrors'), sumReady: document.getElementById('sumReady'), banner: document.getElementById('validationBanner'), preview: document.getElementById('previewList'), generate: document.getElementById('generateButton'), progressFill: document.getElementById('progressFill'), progressText: document.getElementById('progressText'), progressTrack: document.querySelector('.progress-track'), validCount: document.getElementById('validCount'), batchHint: document.getElementById('batchHint'), zip: document.getElementById('zipButton'), printButton: document.getElementById('printButton'), printPanel: document.getElementById('printPanel'), collapsePrint: document.getElementById('collapsePrint'), printStatus: document.getElementById('printStatus'), orientation: document.getElementById('orientationSelect'), photosPerPage: document.getElementById('photosPerPageSelect'), includedCount: document.getElementById('includedCount'), excludedCount: document.getElementById('excludedCount'), pageCount: document.getElementById('pageCount'), refreshPrint: document.getElementById('refreshPrint'), resetPrint: document.getElementById('resetPrint'), exportPdf: document.getElementById('exportPdf'), placementEditor: document.getElementById('placementEditor'), selectedPhotoName: document.getElementById('selectedPhotoName'), selectedPhotoInfo: document.getElementById('selectedPhotoInfo'), sizeRange: document.getElementById('sizeRange'), sizeOutput: document.getElementById('sizeOutput'), resetSelected: document.getElementById('resetSelected'), printPreview: document.getElementById('printPreview'), pdfState: document.getElementById('pdfState') };
    function iconSize(bytes) { if (!Number.isFinite(bytes))
        return ''; if (bytes < 1048576)
        return Math.max(1, Math.round(bytes / 1024)) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }
    function keyFor(file) { return [file.name, file.size, file.lastModified].join('|'); }
    function supported(file) { return /^image\/(jpeg|png)$/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name); }
    function baseOutputName(name) { var cut = name.lastIndexOf('.'), base = cut > 0 ? name.slice(0, cut) : name; return (base || 'photo') + '_stamped.jpg'; }
    function dedupeName(name, used) { var candidate = name, index = 2, cut = name.lastIndexOf('.'), base = cut > 0 ? name.slice(0, cut) : name, ext = cut > 0 ? name.slice(cut) : ''; while (used.has(candidate.toLowerCase())) {
        candidate = base + '_' + index + ext;
        index++;
    } used.add(candidate.toLowerCase()); return candidate; }
    function nextOutputName(name) { var used = new Set(photos.map(function (p) { return p.outputName.toLowerCase(); })); return dedupeName(baseOutputName(name), used); }
    function metadataSnapshot(meta) { return { date: String(meta && meta.date || '').trim(), time: String(meta && meta.time || '').trim(), location: String(meta && meta.location || ''), coordinates: String(meta && meta.coordinates || '') }; }
    function metadataSignature(meta) { var snapshot = meta ? metadataSnapshot(meta) : null; return snapshot ? JSON.stringify([snapshot.date, snapshot.time, snapshot.location, snapshot.coordinates]) : ''; }
    function importedMetadataFor(photo) { var row = importRows.find(function (item) { return item.photo_id === photo.id && !item.errors.length; }); return metadataSnapshot(row || photo.metadata); }
    function currentOutputs() { return photos.filter(function (p) { return p.status === 'generated' && p.outputBlob && p.metadata && p.outputSignature === metadataSignature(p.metadata); }); }
    function setStatus(photo, status, message, tone) { photo.status = status; var card = photo.node; if (!card)
        return; var badge = card.querySelector('.status'); badge.className = 'status status-' + status; var statusLabels = { ready: 'Siap', processing: 'Memproses', generated: 'Selesai', failed: 'Gagal', stale: 'Usang' }; badge.textContent = statusLabels[status] || status; var msg = card.querySelector('.card-message'); msg.className = 'card-message' + (tone ? ' ' + tone : ''); msg.textContent = message || ''; card.querySelector('.retry-btn').classList.toggle('hidden', status !== 'failed' || !photo.metadata); card.querySelector('.download-btn').classList.toggle('hidden', status !== 'generated' || !photo.outputBlob); updateActions(); }
    function updatePhotoPreview(photo) { var target = photo.node.querySelector('.meta-preview'); if (!photo.metadata) {
        target.textContent = 'Menunggu metadata CSV yang valid.';
        return;
    } var top = [photo.metadata.date, photo.metadata.time].filter(Boolean).join(' · '), parts = []; if (top)
        parts.push(top); if (photo.metadata.location && photo.metadata.location.trim())
        parts.push(photo.metadata.location); if (photo.metadata.coordinates && photo.metadata.coordinates.trim())
        parts.push(photo.metadata.coordinates); target.textContent = parts.join('\n') || 'Tidak ada metadata yang dapat dicetak.'; }
    function updateCounts() { var n = photos.length; el.photoCount.textContent = n ? n + (' foto dipilih') : 'Belum ada foto dipilih'; el.empty.classList.toggle('hidden', n > 0); el.exportButton.disabled = n === 0 || generating; el.sumUploaded.textContent = n; }
    function readyPhotos() { return photos.filter(function (p) { return p.decodeReady && p.metadata && p.validationValid && p.status !== 'processing' && !(p.status === 'generated' && p.outputSignature === metadataSignature(p.metadata)); }); }
    function updateActions() { var ready = readyPhotos().length, valid = currentOutputs().length; el.generate.disabled = ready === 0 || generating; el.generate.textContent = generating ? 'Sedang membuat…' : 'Buat semua' + (ready ? ' (' + ready + ')' : ''); el.validCount.textContent = valid + (' file siap'); el.zip.disabled = valid === 0 || zipping || generating; el.importButton.disabled = generating || workMode !== 'custom'; el.exportButton.disabled = photos.length === 0 || generating || workMode !== 'custom'; if (!zipping) {
        el.zip.textContent = 'Unduh semua dalam ZIP';
        if (zipError) {
            el.batchHint.textContent = zipError;
            el.batchHint.classList.add('batch-error');
        }
        else {
            el.batchHint.textContent = valid ? 'Hanya JPG terbaru yang berhasil dibuat yang akan disertakan.' : 'Buat hasil foto sebelum membuat ZIP.';
            el.batchHint.classList.remove('batch-error');
        }
    } updateCounts(); }
    function loadImage(file, url) { if ('createImageBitmap' in window)
        return createImageBitmap(file).then(function (bitmap) { return { source: bitmap, width: bitmap.width, height: bitmap.height, close: function () { bitmap.close(); } }; }); return new Promise(function (resolve, reject) { var image = new Image(); image.onload = function () { resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: function () { } }); }; image.onerror = function () { reject(new Error('Browser tidak dapat membaca gambar ini.')); }; image.src = url; }); }
    async function inspectPhoto(photo) { try {
        var decoded = await loadImage(photo.file, photo.objectUrl);
        photo.width = decoded.width;
        photo.height = decoded.height;
        photo.decodeReady = true;
        photo.decodeError = '';
        decoded.close();
        photo.node.querySelector('.file-meta').textContent = photo.width + ' × ' + photo.height + ' px · ' + iconSize(photo.file.size);
        if (photo.metadata && photo.validationValid)
            setStatus(photo, 'ready', 'Sudah divalidasi dan siap diproses massal.', '');
        return true;
    }
    catch (error) {
        photo.decodeReady = false;
        photo.decodeError = error && error.message ? error.message : 'Browser tidak dapat membaca gambar ini.';
        setStatus(photo, 'failed', photo.decodeError, 'bad');
        return false;
    } }
    function addPhoto(file) { var id = 'photo_' + String(++nextId).padStart(3, '0'), ok = supported(file), photo = { id: id, file: file, fileName: file.name, objectUrl: ok ? URL.createObjectURL(file) : '', width: 0, height: 0, decodeReady: false, decodeError: ok ? '' : 'Format gambar tidak didukung. Gunakan JPG, JPEG, atau PNG.', metadata: null, validationValid: false, status: ok ? 'ready' : 'failed', outputBlob: null, outputUrl: null, outputName: nextOutputName(file.name), outputSignature: '', outputVersion: 0, node: null }; var node = el.template.content.firstElementChild.cloneNode(true); photo.node = node; node.dataset.id = id; node.querySelector('.file-name').textContent = file.name; node.querySelector('.photo-id').textContent = id; var image = node.querySelector('.thumb'); if (photo.objectUrl) {
        image.src = photo.objectUrl;
        image.alt = 'Pratinjau asli ' + file.name;
    }
    else {
        image.remove();
    } node.querySelector('.remove-btn').addEventListener('click', function () { removePhoto(photo); }); node.querySelector('.retry-btn').addEventListener('click', function () { retryPhoto(photo); }); node.querySelector('.download-btn').addEventListener('click', function () { downloadPhoto(photo); }); var editor=document.createElement('div'); editor.className='single-editor'; editor.innerHTML='<div class="single-fields"><label>Tanggal (DD/MM/YYYY)<input data-field="date" placeholder="16/10/2026"></label><label>Waktu (HH:mm:ss)<input data-field="time" placeholder="14:30:00"></label><label>Lokasi<input data-field="location" placeholder="Nama lokasi"></label><label>Koordinat GPS<input data-field="coordinates" placeholder="-7.80, 110.36"></label></div><p class="single-note">Isi tanggal dan waktu. Lokasi serta koordinat opsional. Tidak perlu CSV.</p>'; node.querySelector('.photo-body').appendChild(editor); editor.querySelectorAll('input').forEach(function(input){input.addEventListener('input',function(){if(workMode!=='single')return;var f={};editor.querySelectorAll('input').forEach(function(i){f[i.dataset.field]=i.value.trim();});var has=!!(f.date||f.time||f.location||f.coordinates);photo.metadata=has?metadataSnapshot(f):null;photo.validationValid=!!(validDate(f.date||'')&&validTime(f.time||''));updatePhotoPreview(photo);if(photo.outputBlob)setStatus(photo,'stale','Metadata berubah; buat ulang hasil foto.','warn');else setStatus(photo,photo.validationValid?'ready':'failed',photo.validationValid?'Metadata valid.':'Isi tanggal dan waktu dengan format yang benar.',photo.validationValid?'':'warn');updateActions();});}); photos.push(photo); el.list.appendChild(node); if (ok)
        inspectPhoto(photo);
    else {
        node.querySelector('.file-meta').textContent = iconSize(file.size) + ' · format tidak didukung';
        setStatus(photo, 'failed', 'Format tidak didukung. Gunakan JPG, JPEG, atau PNG.', 'bad');
    } }
    function addFiles(fileList) { var incoming = Array.from(fileList || []); if (!incoming.length)
        return; incoming.forEach(function (file) { addPhoto(file); }); if (workMode === 'exif') { Promise.all(photos.map(function(p){return readExifMetadata(p);})).then(function(){if(readyPhotos().length){generateAll().then(function(){if(currentOutputs().length)downloadZip();});}}); } if (imported)
        resetImport('Daftar foto berubah. Ekspor templat baru lalu impor kembali.'); updateCounts(); updateActions(); el.notice.className = 'notice'; el.notice.textContent = incoming.length + ' foto ditambahkan. File dengan nama yang sama tetap dipisahkan dan menerima ID foto yang berbeda.'; el.fileInput.value = ''; }
    function removePhoto(photo) { if (photo.objectUrl)
        URL.revokeObjectURL(photo.objectUrl); if (photo.outputUrl)
        URL.revokeObjectURL(photo.outputUrl); photos = photos.filter(function (item) { return item.id !== photo.id; }); photo.node.remove(); if (imported)
        resetImport('Daftar foto berubah. Ekspor templat baru lalu impor kembali.'); updateCounts(); updateActions(); if (printState.open)
        syncPrintLayout(false); }
    function csvEscape(value) { var text = String(value == null ? '' : value); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
    function triggerDownload(blob, name) { var url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000); }
    function exportCsv() { if (!photos.length)
        return; var lines = [EXPORT_HEADERS.join(',')]; photos.forEach(function (photo) { var meta = photo.metadata && photo.validationValid ? photo.metadata : { date: '', time: '', location: '', coordinates: '' }; lines.push([photo.id, photo.fileName, meta.date, meta.time, meta.location, meta.coordinates].map(csvEscape).join(',')); }); var blob = new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }); triggerDownload(blob, 'PhotoStamp_Metadata_Template.csv'); }
    function parseCSV(text) { if (!window.Papa)
        throw new Error('Pengurai CSV tidak tersedia. Muat ulang halaman lalu coba lagi.'); var result = window.Papa.parse(String(text || '').replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: 'greedy' }), rows = result.data; rows.parseErrors = result.errors || []; return rows; }
    function validDate(value) { var m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m)
        return false; var d = +m[1], mo = +m[2], y = +m[3], date = new Date(Date.UTC(y, mo - 1, d)); return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d; }
    function validTime(value) { var m = value.match(/^(\d{2}):(\d{2}):(\d{2})$/); return !!m && +m[1] < 24 && +m[2] < 60 && +m[3] < 60; }
    function resetImport(message) { imported = false; importRows = []; photos.forEach(function (photo) { photo.metadata = null; photo.validationValid = false; updatePhotoPreview(photo); if (photo.status === 'generated')
        setStatus(photo, 'stale', 'Daftar foto berubah — impor kembali metadata.', 'warn');
    else if (photo.status !== 'failed')
        setStatus(photo, 'ready', 'Menunggu baris CSV yang valid.', ''); }); el.summary.classList.add('hidden'); el.preview.innerHTML = ''; el.importName.textContent = 'Belum ada CSV terbaru'; el.banner.className = 'validation-banner bad'; el.banner.textContent = message || 'Impor templat yang sudah diisi untuk memvalidasinya.'; updateActions(); if (printState.open)
        syncPrintLayout(false); }
    function makePreviewRow(row) { var item = document.createElement('div'); item.className = 'csv-row'; function cell(label, text, className) { var box = document.createElement('div'), lab = document.createElement('span'); lab.className = 'row-label'; lab.textContent = label; box.appendChild(lab); var value = document.createElement(label === 'ID Foto' ? 'code' : 'span'); if (className)
        value.className = className; value.textContent = text || '—'; box.appendChild(value); item.appendChild(box); } cell('ID Foto', row.photo_id); cell('Nama file', row.filename); cell('Metadata', [row.date, row.time, row.location, row.coordinates].filter(function (value) { return value && value.trim(); }).join(' · '), 'csv-meta'); cell('Validasi', row.errors.length ? row.errors.join(' ') : 'Siap', '' + (row.errors.length ? 'row-error' : 'row-ok')); return item; }
    function applyRows(rows, fileName) { if (!rows.length)
        throw new Error('CSV kosong.'); var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); }), missing = REQUIRED.filter(function (h) { return headers.indexOf(h) < 0; }); if (missing.length)
        throw new Error('Kolom wajib berikut tidak ada' + '' + ': ' + missing.join(', ') + '.'); var index = {}; headers.forEach(function (h, i) { if (index[h] === undefined)
        index[h] = i; }); var parserErrors = rows.parseErrors || [], dataRows = rows.slice(1).filter(function (r) { return r.some(function (v) { return v !== ''; }); }), counts = {}; dataRows.forEach(function (r) { var id = (r[index.photo_id] || '').trim(); counts[id] = (counts[id] || 0) + 1; }); var byId = new Map(photos.map(function (p) { return [p.id, p]; })); importRows = dataRows.map(function (r, n) { var item = { line: n + 2, photo_id: (r[index.photo_id] || '').trim(), filename: r[index.filename] || '', date: (r[index.date] || '').trim(), time: (r[index.time] || '').trim(), location: r[index.location] || '', coordinates: index.coordinates === undefined ? '' : (r[index.coordinates] || ''), errors: parserErrors.filter(function (error) { return error.row === n + 1; }).map(function () { return 'Baris CSV ini tidak dapat diurai dengan benar.'; }) }; if (!item.photo_id)
        item.errors.push('photo_id tidak ada.');
    else if (!byId.has(item.photo_id))
        item.errors.push('photo_id tidak dikenal atau fotonya sudah dihapus.'); if (item.photo_id && counts[item.photo_id] > 1)
        item.errors.push('photo_id duplikat.'); if (item.date && !validDate(item.date))
        item.errors.push('Tanggal harus valid dalam format DD/MM/YYYY.'); if (item.time && !validTime(item.time))
        item.errors.push('Waktu harus dalam format HH:mm:ss.'); if (!item.date && !item.time && !item.location.trim() && !item.coordinates.trim())
        item.errors.push('Semua kolom stempel kosong.'); return item; }); var validMap = new Map(); importRows.forEach(function (row) { if (!row.errors.length)
        validMap.set(row.photo_id, row); }); photos.forEach(function (photo) { var row = validMap.get(photo.id), previous = photo.metadata, oldSignature = metadataSignature(previous); photo.metadata = row ? metadataSnapshot(row) : null; photo.validationValid = !!row; updatePhotoPreview(photo); var newSignature = metadataSignature(photo.metadata); if (photo.outputBlob && photo.outputSignature !== newSignature)
        setStatus(photo, 'stale', photo.metadata ? 'Metadata yang diimpor berubah — buat ulang hasil ini.' : 'Tidak ada baris CSV terbaru yang valid — hasil tidak disertakan.', 'warn');
    else if (photo.outputBlob && photo.outputSignature === newSignature)
        setStatus(photo, 'generated', 'JPG berstempel terbaru sudah siap.', '');
    else if (!photo.decodeReady && photo.decodeError)
        setStatus(photo, 'failed', photo.decodeError, 'bad');
    else if (row)
        setStatus(photo, 'ready', 'Sudah divalidasi dan siap diproses massal.', '');
    else if (photo.objectUrl)
        setStatus(photo, 'ready', 'Tidak ada baris CSV yang valid untuk foto ini.', ''); }); imported = true; el.importName.textContent = fileName; el.summary.classList.remove('hidden'); var matched = importRows.filter(function (r) { return byId.has(r.photo_id); }).length, errors = importRows.filter(function (r) { return r.errors.length; }).length, ready = photos.filter(function (photo) { return photo.decodeReady && photo.metadata && photo.validationValid; }).length; el.sumUploaded.textContent = photos.length; el.sumMatched.textContent = matched; el.sumErrors.textContent = errors; el.sumReady.textContent = ready; el.preview.innerHTML = ''; importRows.forEach(function (row) { el.preview.appendChild(makePreviewRow(row)); }); var missingPhotos = photos.filter(function (p) { return !p.decodeReady || !validMap.has(p.id); }).length; el.banner.className = 'validation-banner ' + (errors || missingPhotos ? 'bad' : 'good'); el.banner.textContent = errors || missingPhotos ? ready + ' foto siap. ' + errors + ' baris CSV bermasalah; ' + missingPhotos + ' foto yang diunggah belum memiliki metadata valid.' : 'Semua ' + ready + ' foto cocok dan lolos validasi.'; updateActions(); if (printState.open)
        syncPrintLayout(false); }
    async function importCsv(file) { if (!file)
        return; el.importName.textContent = 'Membaca ' + file.name + '…'; try {
        var text = await file.text(), rows = parseCSV(text);
        applyRows(rows, file.name);
    }
    catch (error) {
        resetImport(error && error.message ? error.message : 'CSV tidak dapat dibaca.');
        el.importName.textContent = file.name + ' · tidak valid';
    }
    finally {
        el.csvInput.value = '';
    } }
    function wrapText(ctx, text, maxWidth) { var explicit = String(text).split(/\r?\n/), lines = []; explicit.forEach(function (segment) { var words = segment.split(/(\s+)/).filter(function (word) { return word.length; }), line = ''; words.forEach(function (word) { var trial = line + word; if (line && ctx.measureText(trial).width > maxWidth) {
        lines.push(line);
        line = word.replace(/^\s+/, '');
    }
    else if (!line && ctx.measureText(word).width > maxWidth) {
        var part = '';
        Array.from(word).forEach(function (char) { var test = part + char; if (part && ctx.measureText(test).width > maxWidth) {
            lines.push(part);
            part = char;
        }
        else
            part = test; });
        line = part;
    }
    else
        line = trial; }); if (line)
        lines.push(line);
    else if (segment === '')
        lines.push(''); }); return lines; }
    function stampRows(ctx, meta, base, maxWidth) { var rows = [], date = String(meta.date || '').trim(), time = String(meta.time || '').trim(), location = String(meta.location || ''), coordinates = String(meta.coordinates || ''), dateTime = [date, time].filter(Boolean).join('  '), detailSize = Math.max(9, Math.round(base * .78)); if (dateTime)
        rows.push({ text: dateTime, size: base, weight: 750, role: 'date-time' }); function addWrapped(text, role) { if (!text.trim())
        return; ctx.font = '650 ' + detailSize + 'px ui-sans-serif, sans-serif'; wrapText(ctx, text, maxWidth).forEach(function (line) { if (line.trim())
            rows.push({ text: line, size: detailSize, weight: 650, role: role }); }); } addWrapped(location, 'location'); addWrapped(coordinates, 'coordinates'); var expected = []; if (dateTime)
        expected.push('date-time'); if (location.trim())
        expected.push('location'); if (coordinates.trim())
        expected.push('coordinates'); var rendered = new Set(rows.map(function (row) { return row.role; })); if (expected.some(function (role) { return !rendered.has(role); }))
        throw new Error('Stempel tidak lengkap. Tanggal, waktu, lokasi, dan koordinat harus tetap dirender bersama.'); return rows; }
    async function renderStamped(photo, metadata) { var decoded = await loadImage(photo.file, photo.objectUrl); try {
        var width = decoded.width, height = decoded.height;
        if (!width || !height)
            throw new Error('Dimensi gambar tidak dapat dibaca.');
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('Pemrosesan Canvas tidak tersedia.');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(decoded.source, 0, 0, width, height);
        var meta = metadataSnapshot(metadata), minDim = Math.min(width, height), preferredBase = Math.max(13, Math.round(minDim / 30)), minBase = Math.max(9, Math.round(minDim / 64)), margin = Math.max(8, Math.round(minDim * .028)), textMax = width - margin * 2, base = preferredBase, rows = [], lineHeights = [], blockH = 0;
        if (textMax < 20)
            throw new Error('Gambar terlalu sempit untuk menempatkan stempel dengan aman.');
        do {
            rows = stampRows(ctx, meta, base, textMax);
            lineHeights = [];
            blockH = 0;
            rows.forEach(function (row) { var lh = Math.round(row.size * 1.3); lineHeights.push(lh); blockH += lh; });
            if (blockH <= height - margin * 2 || base <= minBase)
                break;
            base--;
        } while (base >= minBase);
        if (!rows.length)
            throw new Error('Tidak ada yang dapat distempel — baris ini tidak memiliki tanggal, waktu, lokasi, atau koordinat.');
        if (blockH > height - margin * 2)
            throw new Error('Teks metadata terlalu panjang untuk dimuat pada gambar tanpa terpotong. Persingkat nilainya di CSV lalu impor kembali.');
        var x = margin, y = Math.max(margin, height - margin - blockH);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        rows.forEach(function (row, index) { ctx.font = row.weight + ' ' + row.size + 'px ui-sans-serif, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.82)'; ctx.lineWidth = Math.max(1.25, row.size * .075); ctx.shadowColor = 'rgba(0,0,0,.62)'; ctx.shadowBlur = Math.max(1.5, row.size * .08); ctx.shadowOffsetX = Math.max(.5, row.size * .025); ctx.shadowOffsetY = Math.max(.5, row.size * .035); ctx.strokeText(row.text, x, y, textMax); ctx.fillText(row.text, x, y, textMax); y += lineHeights[index]; });
        ctx.shadowColor = 'transparent';
        return await new Promise(function (resolve, reject) { canvas.toBlob(function (blob) { blob && blob.type === 'image/jpeg' && blob.size ? resolve(blob) : reject(new Error('Browser tidak dapat mengekspor JPG ini.')); }, 'image/jpeg', .85); });
    }
    finally {
        decoded.close();
    } }
    async function retryPhoto(photo) { if (!photo.decodeReady) {
        var decoded = await inspectPhoto(photo);
        if (!decoded)
            return false;
    } return generateOne(photo); }
    async function generateOne(photo) { if (!photo.decodeReady || !photo.metadata || !photo.validationValid || photo.status === 'processing')
        return false; var renderMetadata = importedMetadataFor(photo), startSignature = metadataSignature(renderMetadata); photo.metadata = renderMetadata; updatePhotoPreview(photo); setStatus(photo, 'processing', 'Membuat JPG resolusi penuh…', ''); try {
        var blob = await renderStamped(photo, renderMetadata), url = URL.createObjectURL(blob);
        if (photo.outputUrl)
            URL.revokeObjectURL(photo.outputUrl);
        photo.outputBlob = blob;
        photo.outputUrl = url;
        photo.outputSignature = startSignature;
        photo.outputVersion++;
        if (metadataSignature(photo.metadata) !== startSignature) {
            setStatus(photo, 'stale', 'Metadata berubah saat diproses — buat kembali.', 'warn');
            return false;
        }
        setStatus(photo, 'generated', 'JPG berstempel terbaru sudah siap.', '');
        if (printState.open)
            syncPrintLayout(false);
        return true;
    }
    catch (error) {
        setStatus(photo, 'failed', error && error.message ? error.message : 'Pembuatan gambar gagal.', 'bad');
        return false;
    } }
    async function generateAll() { var queue = readyPhotos(); if (!queue.length || generating)
        return; generating = true; updateActions(); var total = queue.length, done = 0, success = 0; for (var i = 0; i < queue.length; i++) {
        el.progressText.textContent = 'Memproses ' + (i + 1) + ' dari ' + total + ': ' + queue[i].fileName;
        var ok = await generateOne(queue[i]);
        if (ok)
            success++;
        done++;
        var pct = Math.round(done / total * 100);
        el.progressFill.style.width = pct + '%';
        el.progressTrack.setAttribute('aria-valuenow', String(pct));
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
    } generating = false; el.progressText.textContent = 'Selesai: ' + success + ' berhasil, ' + (total - success) + ' gagal. Item yang gagal dapat dicoba lagi.'; updateActions(); }
    function downloadPhoto(photo) { if (photo.status !== 'generated' || !photo.outputBlob || photo.outputSignature !== metadataSignature(photo.metadata))
        return; triggerDownload(photo.outputBlob, photo.outputName); }
    async function downloadZip() { var valid = currentOutputs(); zipError = ''; if (!valid.length || zipping)
        return; if (!window.JSZip) {
        zipError = 'Pustaka ZIP tidak tersedia. Muat ulang halaman lalu coba lagi.';
        updateActions();
        return;
    } zipping = true; updateActions(); el.zip.textContent = 'Menyiapkan ZIP…'; el.batchHint.textContent = 'Mengemas ' + valid.length + ' file secara lokal.'; try {
        var zip = new window.JSZip(), used = new Set();
        valid.forEach(function (photo) { zip.file(dedupeName(photo.outputName, used), photo.outputBlob); });
        var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        triggerDownload(blob, 'PhotoStamp_Export.zip');
    }
    catch (error) {
        zipError = error && error.message ? 'ZIP gagal: ' + error.message : 'Pembuatan ZIP gagal.';
    }
    finally {
        zipping = false;
        updateActions();
    } }
    function printPageSize() { return printState.orientation === 'landscape' ? { width: 297, height: 210 } : { width: 210, height: 297 }; }
    function printSourceKey(photo) { return photo.id + '|' + photo.outputSignature + '|' + photo.outputVersion; }
    function nearlyEqual(a, b) { return Math.abs(a - b) < .01; }
    function pageCountFromPlacements() { return printState.placements.length ? Math.max.apply(null, printState.placements.map(function (placement) { return placement.page; })) + 1 : 0; }
    function naturalRowHeights(items, columnWidth) { var heights = []; for (var i = 0; i < items.length; i += 2) { var row = items.slice(i, i + 2); heights.push(Math.max.apply(null, row.map(function (photo) { return columnWidth * photo.height / photo.width; }))); } return heights; }
    function buildPrintPlan(eligible) { var pageSize = printPageSize(), margin = printState.margin, gap = printState.gap, printableWidth = pageSize.width - margin * 2, printableHeight = pageSize.height - margin * 2, columnWidth = (printableWidth - gap) / 2, placements = [], offset = 0, page = 0; while (offset < eligible.length) { var remainingPhotos = eligible.slice(offset), count = Math.min(printState.photosPerPage, remainingPhotos.length), pagePhotos = remainingPhotos.slice(0, count), rowNatural = naturalRowHeights(pagePhotos, columnWidth), rows = rowNatural.length, availableForRows = printableHeight - gap * Math.max(0, rows - 1), naturalTotal = rowNatural.reduce(function (sum, height) { return sum + height; }, 0), rowScale = naturalTotal > availableForRows ? availableForRows / naturalTotal : 1, scaledHeights = rowNatural.map(function (height) { return height * rowScale; }), spare = Math.max(0, availableForRows - scaledHeights.reduce(function (sum, height) { return sum + height; }, 0)), rowPadding = rows ? spare / rows : 0, cursorY = margin; pagePhotos.forEach(function (photo, localIndex) { var row = Math.floor(localIndex / 2), column = localIndex % 2, slotX = margin + column * (columnWidth + gap), slotY = cursorY; for (var before = 0; before < row; before++)
                slotY += scaledHeights[before] + rowPadding + gap; var slotHeight = scaledHeights[row] + rowPadding, fitScale = Math.min(columnWidth / photo.width, slotHeight / photo.height), width = Math.max(1, photo.width * fitScale), height = Math.max(1, photo.height * fitScale); placements.push({ id: photo.id, sourceKey: printSourceKey(photo), page: page, slot: localIndex, slotX: slotX, slotY: slotY, slotW: columnWidth, slotH: slotHeight, defaultW: width, defaultH: height, width: width, height: height, x: slotX + (columnWidth - width) / 2, y: slotY + (slotHeight - height) / 2, scale: 1 }); }); offset += count; page += 1; } return placements; }
    function clampPlacement(placement) { placement.width = Math.min(placement.width, placement.slotW); placement.height = Math.min(placement.height, placement.slotH); placement.x = Math.max(placement.slotX, Math.min(placement.x, placement.slotX + placement.slotW - placement.width)); placement.y = Math.max(placement.slotY, Math.min(placement.y, placement.slotY + placement.slotH - placement.height)); }
    function printPhotoFor(placement) { return photos.find(function (photo) { return photo.id === placement.id; }); }
    function sameSlot(a, b) { return a.page === b.page && a.slot === b.slot && nearlyEqual(a.slotX, b.slotX) && nearlyEqual(a.slotY, b.slotY) && nearlyEqual(a.slotW, b.slotW) && nearlyEqual(a.slotH, b.slotH); }
    function syncPrintLayout(forceReset, message) { var eligible = currentOutputs(), previous = new Map(printState.placements.map(function (placement) { return [placement.id, placement]; })), freshPlan = buildPrintPlan(eligible), changed = false; printState.placements = freshPlan.map(function (fresh) { var old = previous.get(fresh.id); if (!forceReset && old && old.sourceKey === fresh.sourceKey && sameSlot(old, fresh)) { fresh.width = Math.min(old.width, fresh.slotW); fresh.height = Math.min(old.height, fresh.slotH); fresh.scale = Math.min(old.scale || 1, 1); fresh.x = old.x; fresh.y = old.y; clampPlacement(fresh); return fresh; } if (old)
            changed = true; return fresh; }); if (previous.size !== printState.placements.length)
        changed = true; if (!printState.placements.some(function (placement) { return placement.id === printState.selectedId; }))
        printState.selectedId = null; if (message)
        printState.notice = message; else if (changed && !forceReset)
        printState.notice = 'Tata letak diperbarui karena hasil foto yang tersedia berubah.'; renderPrintLayout(); }
    function setPrintStatus(eligible, excluded) { var pageTotal = pageCountFromPlacements(); el.includedCount.textContent = eligible; el.excludedCount.textContent = excluded; el.pageCount.textContent = pageTotal; if (!photos.length) { el.printStatus.className = 'print-status bad'; el.printStatus.textContent = 'Belum ada foto yang diunggah. Unggah foto terlebih dahulu.'; }
        else if (!eligible) { el.printStatus.className = 'print-status bad'; el.printStatus.textContent = 'Belum ada JPG berstempel terbaru. Impor metadata yang valid lalu buat hasil foto sebelum mencetak.'; }
        else if (excluded) { var stale = photos.filter(function (photo) { return photo.outputBlob && photo.status !== 'generated'; }).length; el.printStatus.className = 'print-status warn'; el.printStatus.textContent = eligible + ' foto terbaru disertakan dalam ' + pageTotal + ' halaman; ' + excluded + ' belum siap' + (stale ? ' (' + stale + ' hasil usang)' : '') + '. Foto yang belum siap tidak dimasukkan sampai dibuat ulang.'; }
        else { el.printStatus.className = 'print-status good'; el.printStatus.textContent = 'Semua ' + eligible + ' foto terbaru disusun dua kolom, maksimal ' + printState.photosPerPage + ' foto per halaman, dalam ' + pageTotal + ' halaman A4.'; } }
    function percent(value, total) { return (value / total * 100).toFixed(5) + '%'; }
    function updatePlacementElement(node, placement) { var size = printPageSize(); node.style.left = percent(placement.x, size.width); node.style.top = percent(placement.y, size.height); node.style.width = percent(placement.width, size.width); node.style.height = percent(placement.height, size.height); }
    function updatePlacementEditor() { var placement = printState.placements.find(function (item) { return item.id === printState.selectedId; }), photo = placement && printPhotoFor(placement); el.placementEditor.classList.toggle('hidden', !placement || !photo); if (!placement || !photo)
        return; el.selectedPhotoName.textContent = photo.fileName; el.selectedPhotoInfo.textContent = 'Halaman ' + (placement.page + 1) + ' · ' + placement.width.toFixed(1) + ' × ' + placement.height.toFixed(1) + ' mm · posisi ' + placement.x.toFixed(1) + ', ' + placement.y.toFixed(1) + ' mm'; el.sizeRange.value = String(Math.round(placement.scale * 100)); el.sizeOutput.value = Math.round(placement.scale * 100) + '%'; }
    function selectPlacement(id) { printState.selectedId = id; Array.from(el.printPreview.querySelectorAll('.print-photo')).forEach(function (node) { node.classList.toggle('selected', node.dataset.id === id); node.setAttribute('aria-pressed', node.dataset.id === id ? 'true' : 'false'); }); updatePlacementEditor(); }
    function beginPlacementDrag(event, placement, node, pageNode) { if (event.button !== undefined && event.button !== 0)
        return; event.preventDefault(); selectPlacement(placement.id); var rect = pageNode.getBoundingClientRect(), size = printPageSize(), startX = event.clientX, startY = event.clientY, originX = placement.x, originY = placement.y; node.setPointerCapture(event.pointerId); function move(moveEvent) { placement.x = originX + (moveEvent.clientX - startX) / rect.width * size.width; placement.y = originY + (moveEvent.clientY - startY) / rect.height * size.height; clampPlacement(placement); updatePlacementElement(node, placement); updatePlacementEditor(); }
        function end(endEvent) { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', end); node.removeEventListener('pointercancel', end); if (node.hasPointerCapture(endEvent.pointerId))
            node.releasePointerCapture(endEvent.pointerId); }
        node.addEventListener('pointermove', move); node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end); }
    function renderPrintLayout() { var pageSize = printPageSize(), eligible = printState.placements.length, excluded = Math.max(0, photos.length - eligible), pageTotal = pageCountFromPlacements(); setPrintStatus(eligible, excluded); el.exportPdf.disabled = !eligible || pdfExporting; el.resetPrint.disabled = !eligible; el.refreshPrint.disabled = pdfExporting; el.printPreview.innerHTML = ''; if (!eligible) { var empty = document.createElement('div'); empty.className = 'print-empty'; empty.innerHTML = '<strong>Belum ada foto siap cetak</strong>Hanya JPG berstempel terbaru yang dapat dimasukkan.'; el.printPreview.appendChild(empty); if (!pdfExporting) { el.pdfState.className = 'pdf-state'; el.pdfState.textContent = printState.notice || ''; printState.notice = ''; } updatePlacementEditor(); return; }
        for (var pageIndex = 0; pageIndex < pageTotal; pageIndex++) { var wrap = document.createElement('div'); wrap.className = 'print-page-wrap'; var label = document.createElement('div'); label.className = 'print-page-label'; var pagePhotos = printState.placements.filter(function (placement) { return placement.page === pageIndex; }); label.innerHTML = '<span>Halaman ' + (pageIndex + 1) + ' dari ' + pageTotal + '</span><span>' + pagePhotos.length + ' foto · A4 ' + (printState.orientation === 'portrait' ? 'potret' : 'lanskap') + '</span>'; wrap.appendChild(label); var page = document.createElement('div'); page.className = 'print-page' + (printState.orientation === 'landscape' ? ' landscape' : ''); page.dataset.page = String(pageIndex); page.setAttribute('aria-label', 'Pratinjau halaman ' + (pageIndex + 1)); var printable = document.createElement('div'); printable.className = 'printable-area'; printable.style.left = percent(printState.margin, pageSize.width); printable.style.top = percent(printState.margin, pageSize.height); printable.style.width = percent(pageSize.width - printState.margin * 2, pageSize.width); printable.style.height = percent(pageSize.height - printState.margin * 2, pageSize.height); page.appendChild(printable); pagePhotos.forEach(function (placement) { var slotNode = document.createElement('div'); slotNode.className = 'print-slot'; slotNode.style.left = percent(placement.slotX, pageSize.width); slotNode.style.top = percent(placement.slotY, pageSize.height); slotNode.style.width = percent(placement.slotW, pageSize.width); slotNode.style.height = percent(placement.slotH, pageSize.height); page.appendChild(slotNode); });
            pagePhotos.forEach(function (placement) { var photo = printPhotoFor(placement); if (!photo)
                return; var node = document.createElement('button'); node.className = 'print-photo' + (placement.id === printState.selectedId ? ' selected' : ''); node.type = 'button'; node.dataset.id = placement.id; node.setAttribute('aria-label', 'Pilih dan geser ' + photo.fileName); node.setAttribute('aria-pressed', placement.id === printState.selectedId ? 'true' : 'false'); updatePlacementElement(node, placement); var image = document.createElement('img'); image.src = photo.outputUrl; image.alt = 'Hasil berstempel ' + photo.fileName; node.appendChild(image); node.addEventListener('click', function () { selectPlacement(placement.id); }); node.addEventListener('pointerdown', function (event) { beginPlacementDrag(event, placement, node, page); }); page.appendChild(node); }); wrap.appendChild(page); el.printPreview.appendChild(wrap); }
        if (printState.notice) { el.pdfState.className = 'pdf-state'; el.pdfState.textContent = printState.notice; printState.notice = ''; }
        else if (!pdfExporting) { el.pdfState.className = 'pdf-state'; el.pdfState.textContent = ''; } updatePlacementEditor(); }
    function openPrintPanel() { printState.open = true; el.printPanel.classList.remove('hidden'); el.printButton.setAttribute('aria-expanded', 'true'); el.orientation.value = printState.orientation; el.photosPerPage.value = String(printState.photosPerPage); el.pdfState.className = 'pdf-state'; el.pdfState.textContent = 'Menyiapkan pratinjau…'; syncPrintLayout(false); window.requestAnimationFrame(function () { el.printPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
    function closePrintPanel() { printState.open = false; el.printPanel.classList.add('hidden'); el.printButton.setAttribute('aria-expanded', 'false'); el.printButton.focus(); }
    function resetSelectedPlacement() { var fresh = buildPrintPlan(currentOutputs()).find(function (placement) { return placement.id === printState.selectedId; }), index = printState.placements.findIndex(function (placement) { return placement.id === printState.selectedId; }); if (!fresh || index < 0)
        return; printState.placements[index] = fresh; renderPrintLayout(); selectPlacement(fresh.id); }
    function resizeSelected(value) { var placement = printState.placements.find(function (item) { return item.id === printState.selectedId; }); if (!placement)
        return; var scale = Math.max(.4, Math.min(1, Number(value) / 100)), centerX = placement.x + placement.width / 2, centerY = placement.y + placement.height / 2; placement.scale = scale; placement.width = placement.defaultW * scale; placement.height = placement.defaultH * scale; placement.x = centerX - placement.width / 2; placement.y = centerY - placement.height / 2; clampPlacement(placement); var node = el.printPreview.querySelector('.print-photo[data-id="' + CSS.escape(placement.id) + '"]'); if (node)
        updatePlacementElement(node, placement); updatePlacementEditor(); }
    function blobToDataUrl(blob) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error('JPG tidak dapat dibaca untuk PDF.')); }; reader.readAsDataURL(blob); }); }
    async function exportPrintPdf() { if (pdfExporting || !printState.placements.length)
        return; var current = new Map(currentOutputs().map(function (photo) { return [photo.id, photo]; })), invalid = printState.placements.some(function (placement) { var photo = current.get(placement.id); return !photo || printSourceKey(photo) !== placement.sourceKey; }); if (invalid) { syncPrintLayout(false, 'Tata letak disegarkan karena ada hasil foto yang berubah. Tinjau kembali sebelum mengekspor.'); el.pdfState.className = 'pdf-state bad'; el.pdfState.textContent = 'PDF belum dibuat karena sumber gambar berubah. Pratinjau sudah diperbarui.'; return; }
        if (!window.jspdf || !window.jspdf.jsPDF) { el.pdfState.className = 'pdf-state bad'; el.pdfState.textContent = 'Pustaka PDF tidak tersedia. Periksa koneksi lalu muat ulang halaman.'; return; }
        pdfExporting = true; el.exportPdf.disabled = true; el.exportPdf.textContent = 'Membuat PDF…'; el.pdfState.className = 'pdf-state'; el.pdfState.textContent = 'Membuat PDF dari gambar resolusi penuh…'; try { var JsPDF = window.jspdf.jsPDF, doc = new JsPDF({ orientation: printState.orientation, unit: 'mm', format: 'a4', compress: true }), totalPages = pageCountFromPlacements(); for (var pageIndex = 0; pageIndex < totalPages; pageIndex++) { if (pageIndex)
                doc.addPage('a4', printState.orientation); var pagePlacements = printState.placements.filter(function (placement) { return placement.page === pageIndex; }); for (var i = 0; i < pagePlacements.length; i++) { var placement = pagePlacements[i], photo = current.get(placement.id), dataUrl = await blobToDataUrl(photo.outputBlob); doc.addImage(dataUrl, 'JPEG', placement.x, placement.y, placement.width, placement.height, undefined, 'FAST'); } } doc.save('PhotoStamp_Print_A4.pdf'); el.pdfState.className = 'pdf-state good'; el.pdfState.textContent = 'PDF siap diunduh: ' + totalPages + ' halaman, ' + printState.placements.length + ' foto.'; }
        catch (error) { el.pdfState.className = 'pdf-state bad'; el.pdfState.textContent = error && error.message ? 'Pembuatan PDF gagal: ' + error.message : 'Pembuatan PDF gagal.'; }
        finally { pdfExporting = false; el.exportPdf.disabled = !printState.placements.length; el.exportPdf.textContent = 'Ekspor PDF'; } }
    var modeButtons=Array.from(document.querySelectorAll('.mode-btn'));
    var modeDescriptions={custom:'Custom: alur saat ini, isi metadata melalui template CSV lalu impor dan generate.',single:'Satuan: isi metadata langsung pada setiap foto tanpa CSV.',exif:'Berdasar EXIF: baca tanggal, waktu, dan GPS yang tersimpan pada foto lalu siapkan untuk generate otomatis.'};
    function applyMode(mode){workMode=mode;document.body.dataset.mode=mode;modeButtons.forEach(function(b){var a=b.dataset.mode===mode;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});document.getElementById('modeDescription').textContent=modeDescriptions[mode];el.exportButton.closest('.step').classList.toggle('hidden',mode!=='custom');el.importButton.closest('.step').classList.toggle('hidden',mode!=='custom');
      if(mode==='custom'){photos.forEach(function(p){p.metadata=null;p.validationValid=false;updatePhotoPreview(p);});resetImport('Mode Custom aktif. Ekspor templat CSV lalu impor metadata yang sudah diisi.');}
      if(mode==='single'){imported=false;photos.forEach(function(p){var ed=p.node.querySelector('.single-editor'),f={};ed.querySelectorAll('input').forEach(function(i){f[i.dataset.field]=i.value.trim();});p.metadata=(f.date||f.time||f.location||f.coordinates)?metadataSnapshot(f):null;p.validationValid=!!(validDate(f.date||'')&&validTime(f.time||''));updatePhotoPreview(p);});updateActions();}
      if(mode==='exif'){imported=false;Promise.all(photos.map(function(p){return readExifMetadata(p);})).then(function(){if(readyPhotos().length){generateAll().then(function(){if(currentOutputs().length)downloadZip();});}});} updateActions();}
    async function readExifMetadata(photo){try{if(!window.ExifReader)throw new Error('Pembaca EXIF tidak tersedia. Pastikan internet aktif lalu muat ulang.');var tags=await window.ExifReader.load(photo.file,{expanded:true}),ex=tags.exif||{},gps=tags.gps||{},raw=(ex.DateTimeOriginal&&ex.DateTimeOriginal.description)||(ex.DateTimeDigitized&&ex.DateTimeDigitized.description)||(ex.DateTime&&ex.DateTime.description)||'',m=raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/),date=m?m[3]+'/'+m[2]+'/'+m[1]:'',time=m?m[4]+':'+m[5]+':'+m[6]:'',lat=gps.Latitude,lon=gps.Longitude,lat=lat!=null?(typeof lat==='object'?lat.description:String(lat)):'',lon=lon!=null?(typeof lon==='object'?lon.description:String(lon)):'',coords=lat&&lon?lat+', '+lon:'';photo.metadata={date:date,time:time,location:'',coordinates:coords};photo.validationValid=!!(validDate(date)&&validTime(time));updatePhotoPreview(photo);setStatus(photo,photo.validationValid?'ready':'failed',photo.validationValid?(coords?'EXIF tanggal/waktu dan GPS ditemukan.':'Tanggal/waktu ditemukan; GPS tidak tersedia.'):'Tanggal/waktu EXIF tidak lengkap. Coba mode Satuan.',photo.validationValid?'':'warn');}catch(e){photo.metadata=null;photo.validationValid=false;setStatus(photo,'failed',e.message||'EXIF tidak dapat dibaca.','warn');}updateActions();return photo.validationValid;}
    modeButtons.forEach(function(b){b.addEventListener('click',function(){applyMode(b.dataset.mode);});});
    el.dropzone.addEventListener('click', function () { el.fileInput.click(); });
    el.dropzone.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.fileInput.click();
    } });
    el.fileInput.addEventListener('change', function () { addFiles(el.fileInput.files); });
    ['dragenter', 'dragover'].forEach(function (type) { el.dropzone.addEventListener(type, function (event) { event.preventDefault(); el.dropzone.classList.add('is-dragging'); }); });
    ['dragleave', 'drop'].forEach(function (type) { el.dropzone.addEventListener(type, function (event) { event.preventDefault(); el.dropzone.classList.remove('is-dragging'); }); });
    el.dropzone.addEventListener('drop', function (event) { addFiles(event.dataTransfer.files); });
    el.exportButton.addEventListener('click', exportCsv);
    el.importButton.addEventListener('click', function () { el.csvInput.click(); });
    el.csvInput.addEventListener('change', function () { importCsv(el.csvInput.files && el.csvInput.files[0]); });
    el.generate.addEventListener('click', generateAll);
    el.zip.addEventListener('click', downloadZip);
    el.printButton.addEventListener('click', function () { if (printState.open)
        closePrintPanel();
    else
        openPrintPanel(); });
    el.collapsePrint.addEventListener('click', closePrintPanel);
    el.orientation.addEventListener('change', function () { printState.orientation = el.orientation.value === 'landscape' ? 'landscape' : 'portrait'; printState.selectedId = null; syncPrintLayout(true, 'Orientasi diubah. Tata letak kembali ke posisi awal agar tetap berada di area cetak.'); });
    el.photosPerPage.addEventListener('change', function () { var value = Number(el.photosPerPage.value); printState.photosPerPage = [4, 6, 8, 10].indexOf(value) >= 0 ? value : 4; printState.selectedId = null; syncPrintLayout(true, 'Kapasitas diubah menjadi ' + printState.photosPerPage + ' foto per halaman. Tata letak diperbarui.'); });
    el.refreshPrint.addEventListener('click', function () { syncPrintLayout(false, 'Pratinjau menggunakan semua JPG berstempel terbaru yang tersedia.'); });
    el.resetPrint.addEventListener('click', function () { printState.selectedId = null; syncPrintLayout(true, 'Seluruh foto dikembalikan ke tata letak dua kolom dengan ' + printState.photosPerPage + ' foto per halaman.'); });
    el.resetSelected.addEventListener('click', resetSelectedPlacement);
    el.sizeRange.addEventListener('input', function () { resizeSelected(el.sizeRange.value); });
    el.exportPdf.addEventListener('click', exportPrintPdf);
    window.addEventListener('beforeunload', function () { photos.forEach(function (photo) { if (photo.objectUrl)
        URL.revokeObjectURL(photo.objectUrl); if (photo.outputUrl)
        URL.revokeObjectURL(photo.outputUrl); }); });
    window.__photostampTest = { parseCSV: parseCSV, validDate: validDate, validTime: validTime, csvEscape: csvEscape, buildPrintPlan: buildPrintPlan, pageCountFromPlacements: pageCountFromPlacements };
    updateCounts();
    updateActions();
}());
