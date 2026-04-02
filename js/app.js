// ── DATA ──────────────────────────────────────────────────────────────
const application = {
    id: '',
    company: '',
    jobTitle: '',
    location: '',
    contract: '',
    salary: '',
    status: '',
    dateApply: '',
    lastUpdate: '',
    urlOffer: '',
    interviewNumber: 0,
    urlCover: ''
}

async function openDB(){
    let db = new Promise((resolve, reject) => {
        const request = indexedDB.open('job-tracker-db', 1);
        request.onerror = (event) => reject(event.target.error);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('applications')) {
                db.createObjectStore('applications', { keyPath: 'id' });
            }
        };

    });
    return db;
}

let db = null;

async function saveApplication(application) {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['applications'], 'readwrite');
        const store = transaction.objectStore('applications');
        const request = store.put(application);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

async function readApplications(){
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['applications'], 'readonly');
        const store = transaction.objectStore('applications');
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function deleteApplication(id) {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['applications'], 'readwrite');
        const store = transaction.objectStore('applications');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}


const STATUS = {
  postule:   { label: 'Postulé',        cls: 's-postule',   color: '#1a6fa8', bar: '#1a6fa8' },
  relance:   { label: 'Relancé',        cls: 's-relance',   color: '#d68910', bar: '#d68910' },
  entretien: { label: 'Entretien',      cls: 's-entretien', color: '#2d6a4f', bar: '#2d6a4f' },
  test:      { label: 'Test technique', cls: 's-test',      color: '#7c3aed', bar: '#7c3aed' },
  offre:     { label: 'Offre reçue',    cls: 's-offre',     color: '#b7950b', bar: '#b7950b' },
  refus:     { label: 'Refus',          cls: 's-refus',     color: '#c0392b', bar: '#c0392b' },
  archive:   { label: 'Archivé',        cls: 's-archive',   color: '#7a746a', bar: '#c8c2ba' },
};

async function displayJobApplications(){
    const applications = await readApplications();
    console.log(applications);

    // Read the filter values
    // search for company, job title, location
    let searchFilter = document.getElementById('searchInput').value.toLowerCase();

    let statusFilter = document.getElementById('filterStatus').value;

    let orderFilter = document.getElementById('sortBy').value;

    // Apply filters
    let filteredApps = applications.filter(app => {
        const matchesSearch = app.company.toLowerCase().includes(searchFilter) ||
                              app.jobTitle.toLowerCase().includes(searchFilter) ||
                              app.location.toLowerCase().includes(searchFilter);
        const matchesStatus = statusFilter === '' || app.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Apply sorting
    if(orderFilter === 'date_desc'){
        filteredApps.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
    } else if(orderFilter === 'date_asc'){
        filteredApps.sort((a, b) => new Date(a.lastUpdate) - new Date(b.lastUpdate));
    } else if(orderFilter === 'company'){
        filteredApps.sort((a, b) => a.company.localeCompare(b.company));
    } else if(orderFilter === 'status'){
        filteredApps.sort((a, b) => a.status.localeCompare(b.status));
    }

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
    </tr>
    `;

    const tableBody = filteredApps.map(app => `
        <tr onclick="openEditModal('${app.id}')">
            <td>${app.company}</td>
            <td>
                ${app.urlOffer ? `<a href="${app.urlOffer}" target="_blank" onclick="event.stopPropagation();">${app.jobTitle}</a>` : app.jobTitle}
            </td>
            <td>${app.location}</td>
            <td>${app.contract}</td>
            <td>${app.salary}</td>
            <td><span class="badge ${STATUS[app.status]?.cls || 's-postule'}">${STATUS[app.status]?.label || 'Postulé'}</span></td>
            <td>${app.interviewNumber}</td>
            <td>${app.dateApply}</td>
            <td>${app.lastUpdate}</td>
        </tr>
    `).join('');

    const tableFooter = `</table>`;

    document.getElementById('cardsList').innerHTML = tableHead + tableBody + tableFooter;
}

let editingId = null;

function openAddModal(){
    console.log('open add modal');
    editingId = null;
    let modal = document.getElementById('modalOverlay');
    modal.classList.add('open'); 
}

async function openEditModal(id){
    console.log('open edit modal', id);
    editingId = id;
    let application = await readApplications();
    const app = application.find(a => a.id === id);
    if(app){
        console.log('app to edit', app);
        document.getElementById('f-company').value = app.company;
        document.getElementById('f-job-title').value = app.jobTitle;
        document.getElementById('f-location').value = app.location;
        document.getElementById('f-contract').value = app.contract;
        document.getElementById('f-salary').value = app.salary;
        document.getElementById('f-status').value = app.status;
        document.getElementById('f-date-apply').value = app.dateApply;
        document.getElementById('f-url-offer').value = app.urlOffer;
        document.getElementById('f-interviews').value = app.interviewNumber;
        document.getElementById('f-url-cover').value = app.urlCover;
        document.getElementById('modalOverlay').classList.add('open');
        document.getElementById('deleteBtn').classList.add('open');
    }
}

function handleOverlayClick(event){
    if(event.target.id === 'modalOverlay'){
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('deleteBtn').classList.remove('open');
    }
}

function closeModal(){
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('deleteBtn').classList.remove('open');
}

function openConfirm(){
    let confirmModal = document.getElementById('confirmOverlay');
    confirmModal.classList.add('open');
    
}

function closeConfirm(){
    let confirmModal = document.getElementById('confirmOverlay');
    confirmModal.classList.remove('open');
}

function confirmDelete(){
    deleteEntry();
    closeConfirm();
}

async function deleteEntry(){
    if(editingId){
        await deleteApplication(editingId);
        await displayJobApplications();
        document.getElementById('modalOverlay').classList.remove('open');
        document.getElementById('deleteBtn').classList.remove('open');
        editingId = null;
    }
}

async function saveEntry(){
    // Read form data and create application object
    const newApp = {
        id: editingId|| crypto.randomUUID(),
        company: document.getElementById('f-company').value,
        jobTitle: document.getElementById('f-job-title').value,
        location: document.getElementById('f-location').value,
        contract: document.getElementById('f-contract').value,
        salary: document.getElementById('f-salary').value,
        status: document.getElementById('f-status').value,
        dateApply: document.getElementById('f-date-apply').value,
        urlOffer: document.getElementById('f-url-offer').value,
        interviewNumber: parseInt(document.getElementById('f-interviews').value) || 0,
        urlCover: document.getElementById('f-url-cover').value
    };

    newApp.lastUpdate = new Date().toISOString().split('T')[0];

    // Save to IndexedDB
    await saveApplication(newApp);
    // Re-render cards
    await displayJobApplications();
    // Close modal
    document.getElementById('modalOverlay').classList.remove('open');
}



async function init(){
    db = await openDB();
    await displayJobApplications();
}

init();

