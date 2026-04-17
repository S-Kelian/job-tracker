
// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

// Single source of truth for all statuses (label, CSS class, color)
const STATUS = {
    postule:   { label: 'Postulé',        cls: 's-postule',   color: '#1a6fa8' },
    relance:   { label: 'Relancé',        cls: 's-relance',   color: '#d68910' },
    entretien: { label: 'Entretien',      cls: 's-entretien', color: '#2d6a4f' },
    test:      { label: 'Test technique', cls: 's-test',      color: '#7c3aed' },
    offre:     { label: 'Offre reçue',    cls: 's-offre',     color: '#b7950b' },
    refus:     { label: 'Refus',          cls: 's-refus',     color: '#c0392b' },
    archive:   { label: 'Archivé',        cls: 's-archive',   color: '#7a746a' },
};

// Available columns for export (includes fields not shown in the main table)
const EXPORT_COLUMNS = [
    { key: 'company',         label: 'Entreprise' },
    { key: 'jobTitle',        label: 'Poste' },
    { key: 'location',        label: 'Localisation' },
    { key: 'contract',        label: 'Contrat' },
    { key: 'salary',          label: 'Salaire' },
    { key: 'status',          label: 'Statut' },
    { key: 'interviewNumber', label: 'Entretiens' },
    { key: 'dateApply',       label: 'Date candidature' },
    { key: 'lastUpdate',      label: 'Dernière MAJ' },
    { key: 'urlOffer',        label: 'Lien offre' },
    { key: 'urlCover',        label: 'Lettre motivation' },
];

// Maps data keys to their nth-child position in the HTML table (used for PDF column hiding)
const TABLE_COLUMN_MAP = {
    company: 1, jobTitle: 2, location: 3, contract: 4, salary: 5,
    status: 6, interviewNumber: 7, dateApply: 8, lastUpdate: 9,
};


// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════

let db = null;                // IndexedDB instance, initialized once on startup
let editingId = null;         // ID of the application being edited, null when creating
let mailsContainer = [];      // Mails for the currently open form
let currentFilteredApps = []; // Snapshot of filtered apps, used by export


// ═══════════════════════════════════════════════════════════════════════
// DATABASE (IndexedDB)
// ═══════════════════════════════════════════════════════════════════════

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('job-tracker-db', 1);
        request.onerror = (e) => reject(e.target.error);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('applications')) {
                db.createObjectStore('applications', { keyPath: 'id' });
            }
        };
    });
}

// store.put() inserts or updates depending on whether the id already exists
async function saveApplication(application) {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['applications'], 'readwrite');
        const store = transaction.objectStore('applications');
        const request = store.put(application);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

async function readApplications() {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['applications'], 'readonly');
        const store = transaction.objectStore('applications');
        const request = store.getAll();
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function deleteApplication(id) {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['applications'], 'readwrite');
        const store = transaction.objectStore('applications');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}


// ═══════════════════════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════════════════════

function formatDate(dateStr) {
    if (!dateStr) return '';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('fr-FR', options);
}

function updateStats(applications) {
    const total = applications.length;
    const refus = applications.filter(app => app.status === 'refus').length;
    const rate = total > 0 ? Math.round((refus / total) * 100) : 0;
    const entretiens = applications.reduce((sum, app) => sum + app.interviewNumber, 0);

    document.getElementById('statsBar').innerHTML = `
        <div class="stat">
            <span class="stat-value">${total}</span>
            <span class="stat-label">Candidatures</span>
        </div>
        <div class="stat">
            <span class="stat-value">${refus}</span>
            <span class="stat-label">Candidatures refusées</span>
        </div>
        <div class="stat">
            <span class="stat-value">${rate}%</span>
            <span class="stat-label">Taux de refus</span>
        </div>
        <div class="stat">
            <span class="stat-value">${entretiens}</span>
            <span class="stat-label">Entretiens</span>
        </div>
    `;
}

// Main render function — reads DB, applies filters/sort, rebuilds the table
async function displayJobApplications() {
    const applications = await readApplications();

    if (applications.length === 0) {
        currentFilteredApps = [];
        document.getElementById('cardsList').innerHTML = `
            <div class="empty-state">
                <p>Aucune candidature enregistrée.</p>
                <button onclick="openAddModal()" class="btn btn-primary">Ajouter ma première candidature</button>
            </div>
        `;
        updateStats([]);
        return;
    }

    const searchFilter = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;
    const orderFilter  = document.getElementById('sortBy').value;
    const dateMin      = document.getElementById('f-date-min').value;
    const dateMax      = document.getElementById('f-date-max').value;

    let filteredApps = applications.filter(app => {
        const matchesSearch = app.company.toLowerCase().includes(searchFilter)
            || app.jobTitle.toLowerCase().includes(searchFilter)
            || app.location.toLowerCase().includes(searchFilter);
        const matchesStatus = statusFilter === '' || app.status === statusFilter;
        const matchesDate = (dateMin === '' || new Date(app.lastUpdate) >= new Date(dateMin))
            && (dateMax === '' || new Date(app.lastUpdate) <= new Date(dateMax));
        return matchesSearch && matchesStatus && matchesDate;
    });

    if (filteredApps.length === 0) {
        currentFilteredApps = [];
        document.getElementById('cardsList').innerHTML = '<p style="text-align:center;color:var(--text);">Aucune candidature trouvée</p>';
        updateStats([]);
        return;
    }

    if      (orderFilter === 'date_desc') filteredApps.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
    else if (orderFilter === 'date_asc')  filteredApps.sort((a, b) => new Date(a.lastUpdate) - new Date(b.lastUpdate));
    else if (orderFilter === 'company')   filteredApps.sort((a, b) => a.company.localeCompare(b.company));
    else if (orderFilter === 'status')    filteredApps.sort((a, b) => a.status.localeCompare(b.status));

    const tableHead = `
    <table>
    <tr>
        <th>Entreprise</th>
        <th>Poste</th>
        <th>Localisation</th>
        <th>Contrat</th>
        <th>Salaire</th>
        <th>Statut</th>
        <th>Nombre d'entretiens</th>
        <th>Date de candidature</th>
        <th>Dernière mise à jour</th>
    </tr>`;

    const tableBody = filteredApps.map(app => `
        <tr onclick="openEditModal('${app.id}')">
            <td>${app.company}</td>
            <td>
                ${app.urlOffer
                    ? `<a href="${app.urlOffer}" target="_blank" onclick="event.stopPropagation();">${app.jobTitle}</a>`
                    : app.jobTitle}
            </td>
            <td>${app.location}</td>
            <td>${app.contract}</td>
            <td>${app.salary}</td>
            <td><span class="badge ${STATUS[app.status]?.cls || 's-postule'}">${STATUS[app.status]?.label || 'Postulé'}</span></td>
            <td>${app.interviewNumber}</td>
            <td>${formatDate(app.dateApply)}</td>
            <td>${formatDate(app.lastUpdate)}</td>
        </tr>
    `).join('');

    currentFilteredApps = filteredApps;
    document.getElementById('cardsList').innerHTML = tableHead + tableBody + `</table>`;
    updateStats(filteredApps);
}


// ═══════════════════════════════════════════════════════════════════════
// MODAL — APPLICATION FORM (add / edit)
// ═══════════════════════════════════════════════════════════════════════

// Clears all form fields, error states, and mail list
function resetForm() {
    ['f-company','f-job-title','f-location','f-salary',
     'f-date-apply','f-date-update','f-url-offer','f-interviews','f-url-cover'
    ].forEach(id => {
        document.getElementById(id).value = '';
        document.getElementById(id).classList.remove('input-error');
    });
    document.getElementById('f-contract').value = '';
    document.getElementById('f-status').value = 'postule';
    document.getElementById('mailForm').style.display = 'none';
    document.getElementById('formError').style.display = 'none';
    mailsContainer = [];
    renderMails();
}

function openAddModal() {
    editingId = null;
    resetForm();
    document.getElementById('modalOverlay').classList.add('open');
}

async function openEditModal(id) {
    editingId = id;
    const applications = await readApplications();
    const app = applications.find(a => a.id === id);
    if (!app) return;

    document.getElementById('f-company').value      = app.company;
    document.getElementById('f-job-title').value    = app.jobTitle;
    document.getElementById('f-location').value     = app.location;
    document.getElementById('f-contract').value     = app.contract;
    document.getElementById('f-salary').value       = app.salary;
    document.getElementById('f-status').value       = app.status;
    document.getElementById('f-date-apply').value   = app.dateApply;
    document.getElementById('f-date-update').value  = app.lastUpdate;
    document.getElementById('f-url-offer').value    = app.urlOffer;
    document.getElementById('f-interviews').value   = app.interviewNumber;
    document.getElementById('f-url-cover').value    = app.urlCover;

    mailsContainer = app.mails || [];
    renderMails();

    document.getElementById('modalOverlay').classList.add('open');
    document.getElementById('deleteBtn').classList.add('open');
}

function handleOverlayClick(event) {
    if (event.target.id === 'modalOverlay') closeModal();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('deleteBtn').classList.remove('open');
    mailsContainer = [];
}

async function saveEntry() {
    const companyEl  = document.getElementById('f-company');
    const jobTitleEl = document.getElementById('f-job-title');
    let hasError = false;

    [companyEl, jobTitleEl].forEach(el => {
        const empty = !el.value.trim();
        el.classList.toggle('input-error', empty);
        if (empty) hasError = true;
    });

    document.getElementById('formError').style.display = hasError ? 'block' : 'none';
    if (hasError) return;

    const newApp = {
        id:              editingId || crypto.randomUUID(), // crypto.randomUUID() is native, no lib needed
        company:         companyEl.value,
        jobTitle:        jobTitleEl.value,
        location:        document.getElementById('f-location').value,
        contract:        document.getElementById('f-contract').value,
        salary:          document.getElementById('f-salary').value,
        status:          document.getElementById('f-status').value,
        dateApply:       document.getElementById('f-date-apply').value,
        lastUpdate:      document.getElementById('f-date-update').value,
        urlOffer:        document.getElementById('f-url-offer').value,
        urlCover:        document.getElementById('f-url-cover').value,
        interviewNumber: parseInt(document.getElementById('f-interviews').value) || 0,
        mails:           mailsContainer,
    };

    await saveApplication(newApp);
    await displayJobApplications();
    resetForm();
    closeModal();
}


// ═══════════════════════════════════════════════════════════════════════
// MODAL — DELETE CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════

function openConfirm()  { document.getElementById('confirmOverlay').classList.add('open'); }
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

function confirmDelete() {
    deleteEntry();
    closeConfirm();
}

async function deleteEntry() {
    if (!editingId) return;
    await deleteApplication(editingId);
    await displayJobApplications();
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('deleteBtn').classList.remove('open');
    editingId = null;
}


// ═══════════════════════════════════════════════════════════════════════
// MAILS
// ═══════════════════════════════════════════════════════════════════════

function openMailForm() {
    document.getElementById('mailForm').style.display = 'block';
}

function addMail() {
    mailsContainer.push({
        date:     document.getElementById('f-mail-date').value,
        title:    document.getElementById('f-mail-title').value,
        received: document.getElementById('f-mail-received').checked,
        url:      document.getElementById('f-mail-url').value,
    });
    document.getElementById('f-mail-date').value = '';
    document.getElementById('f-mail-title').value = '';
    document.getElementById('f-mail-received').checked = false;
    document.getElementById('f-mail-url').value = '';
    document.getElementById('mailForm').style.display = 'none';
    renderMails();
}

function renderMails() {
    // Spread before sort to avoid mutating mailsContainer (would break splice index in delete buttons)
    const sorted = [...mailsContainer].sort((a, b) => new Date(a.date) - new Date(b.date));
    document.getElementById('mailsList').innerHTML = sorted.map((mail, index) => `
        <div class="mail-entry ${mail.received ? 'received' : 'sent'}">
            <span>${formatDate(mail.date)} : <a href="${mail.url}" target="_blank">${mail.title}</a></span>
            <button onclick="mailsContainer.splice(${index}, 1); renderMails();" style="background:none;border:none;color:red;cursor:pointer;">X</button>
        </div>
    `).join('');
}


// ═══════════════════════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════════════════════

function openImportModal() {
    document.getElementById('importFile').value = '';
    document.getElementById('importText').value = '';
    document.getElementById('importError').style.display = 'none';
    document.getElementById('importOverlay').classList.add('open');
}

function closeImportModal() {
    document.getElementById('importOverlay').classList.remove('open');
}

function handleImportOverlayClick(event) {
    if (event.target.id === 'importOverlay') closeImportModal();
}

// FileReader populates the textarea so the user can review content before importing
function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById('importText').value = e.target.result; };
    reader.readAsText(file);
}

async function runImport() {
    const errorEl = document.getElementById('importError');
    errorEl.style.display = 'none';

    let data;
    try {
        data = JSON.parse(document.getElementById('importText').value);
    } catch {
        errorEl.textContent = 'JSON invalide. Vérifie le format de ton fichier.';
        errorEl.style.display = 'block';
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        errorEl.textContent = 'Le fichier doit contenir un tableau de candidatures non vide.';
        errorEl.style.display = 'block';
        return;
    }

    // store.put() naturally merges: existing ids are updated, new ones are inserted
    await Promise.all(data.map(app => saveApplication({
        ...app,
        id:              app.id || crypto.randomUUID(),
        mails:           app.mails || [],
        interviewNumber: app.interviewNumber || 0,
    })));

    await displayJobApplications();
    closeImportModal();
}


// ═══════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════

function openExportModal() {
    // Checkboxes are generated from EXPORT_COLUMNS to stay in sync if columns change
    document.getElementById('exportColumnsGrid').innerHTML = EXPORT_COLUMNS.map(col => `
        <label class="export-col-option">
            <input type="checkbox" value="${col.key}" checked> ${col.label}
        </label>
    `).join('');
    document.getElementById('exportOverlay').classList.add('open');
}

function closeExportModal() {
    document.getElementById('exportOverlay').classList.remove('open');
}

function handleExportOverlayClick(event) {
    if (event.target.id === 'exportOverlay') closeExportModal();
}

async function runExport() {
    const format      = document.querySelector('input[name="exportFormat"]:checked').value;
    const useFilters  = document.getElementById('exportUseFilters').checked;
    const selectedKeys = [...document.querySelectorAll('#exportColumnsGrid input:checked')].map(cb => cb.value);
    const columns     = EXPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));

    // Use the already-computed filtered snapshot, or re-read the full DB
    const apps = useFilters ? currentFilteredApps : await readApplications();

    if      (format === 'csv')  exportToCSV(apps, columns);
    else if (format === 'json') exportToJSON(apps, columns);
    else if (format === 'pdf')  { exportToPDF(columns); return; }

    closeExportModal();
}

// RFC 4180: fields containing commas, quotes or newlines must be double-quoted
function escapeCSV(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Translates status keys to labels and formats dates for readable CSV/JSON output
function getDisplayValue(app, col) {
    let val = app[col.key] ?? '';
    if (col.key === 'status') val = STATUS[val]?.label || val;
    if (col.key === 'dateApply' || col.key === 'lastUpdate') val = val ? formatDate(val) : '';
    return val;
}

function exportToCSV(apps, columns) {
    const header = columns.map(c => escapeCSV(c.label)).join(',');
    const rows   = apps.map(app => columns.map(c => escapeCSV(getDisplayValue(app, c))).join(','));
    const filename = `candidatures_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`;
    downloadFile([header, ...rows].join('\n'), filename, 'text/csv;charset=utf-8;');
}

function exportToJSON(apps, columns) {
    const data = apps.map(app => Object.fromEntries(columns.map(c => [c.key, app[c.key] ?? ''])));
    const filename = `candidatures_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

function exportToPDF(columns) {
    const selectedKeys = new Set(columns.map(c => c.key));
    const hiddenIndices = Object.entries(TABLE_COLUMN_MAP)
        .filter(([key]) => !selectedKeys.has(key))
        .map(([, idx]) => idx);

    // Inject a temporary print-only <style> to hide unselected columns without touching the DOM
    let styleEl = null;
    if (hiddenIndices.length > 0) {
        const rules = hiddenIndices.map(i =>
            `table th:nth-child(${i}), table td:nth-child(${i}) { display: none; }`
        ).join(' ');
        styleEl = document.createElement('style');
        styleEl.setAttribute('media', 'print');
        styleEl.textContent = rules;
        document.head.appendChild(styleEl);
    }

    window.print();

    // { once: true } auto-removes the listener after first fire
    window.addEventListener('afterprint', () => {
        if (styleEl) document.head.removeChild(styleEl);
    }, { once: true });
}

// Creates a hidden <a> and simulates a click — the only way to trigger a
// client-side file download without a server
function downloadFile(content, filename, mimeType) {
    const link = document.createElement('a');
    link.style.display = 'none';
    link.setAttribute('href', `data:${mimeType},` + encodeURIComponent(content));
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// ═══════════════════════════════════════════════════════════════════════
// INIT & GLOBAL EVENTS
// ═══════════════════════════════════════════════════════════════════════

async function init() {
    // Service worker enables offline support by caching static assets
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./service-worker.js');
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    db = await openDB();
    await displayJobApplications();
}

init();

// Closes the topmost open modal on Escape (priority: confirm > form > export > import)
document.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Escape') return;
    if      (document.getElementById('confirmOverlay').classList.contains('open')) closeConfirm();
    else if (document.getElementById('modalOverlay').classList.contains('open'))   closeModal();
    else if (document.getElementById('exportOverlay').classList.contains('open'))  closeExportModal();
    else if (document.getElementById('importOverlay').classList.contains('open'))  closeImportModal();
});
