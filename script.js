import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-teaching-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- DOM Elements ---
const userIdDisplay = document.getElementById('userIdDisplay');
const userIdSpan = userIdDisplay.querySelector('span');
const totalEarningsElement = document.getElementById('totalEarnings');
const formTitle = document.getElementById('formTitle');
const sessionDateInput = document.getElementById('sessionDate');
const studentNameInput = document.getElementById('studentName');
const topicInput = document.getElementById('topic');
const durationInput = document.getElementById('duration');
const feeInput = document.getElementById('fee');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const errorMessageElement = document.getElementById('errorMessage');
const successMessageElement = document.getElementById('successMessage'); // New: Success Message
const sessionsList = document.getElementById('sessionsList');
const noSessionsMessage = document.getElementById('noSessionsMessage');

// Filter elements
const filterStudentNameInput = document.getElementById('filterStudentName');
const filterTopicInput = document.getElementById('filterTopic');
const filterStartDateInput = document.getElementById('filterStartDate');
const filterEndDateInput = document.getElementById('filterEndDate');
const clearAllFiltersBtn = document.getElementById('clearAllFiltersBtn');

// Datalist elements
const studentNamesDatalist = document.getElementById('student-names');
const topicsDatalist = document.getElementById('topics-list');

// Modal elements
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtnModal = document.getElementById('cancelDeleteBtnModal'); // Corrected ID

// Loading overlay element
const loadingOverlay = document.getElementById('loadingOverlay');

// --- State Variables ---
let currentUserId = null;
let allSessions = []; // Stores all fetched sessions from Firestore
let editingSessionId = null; // ID of the session being edited
let sessionToDeleteId = null; // ID of the session to be deleted

// --- Helper Functions for UI Feedback ---
function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function displayErrorMessage(message) {
    successMessageElement.classList.add('hidden'); // Hide success if error appears
    errorMessageElement.textContent = message;
    errorMessageElement.classList.remove('hidden');
    setTimeout(() => { // Hide error message after 5 seconds
        errorMessageElement.classList.add('hidden');
    }, 5000);
}

function displaySuccessMessage(message) {
    errorMessageElement.classList.add('hidden'); // Hide error if success appears
    successMessageElement.textContent = message;
    successMessageElement.classList.remove('hidden');
    setTimeout(() => { // Hide success message after 5 seconds
        successMessageElement.classList.add('hidden');
    }, 5000);
}

function hideMessages() {
    errorMessageElement.classList.add('hidden');
    successMessageElement.classList.add('hidden');
}

// --- Firebase Authentication ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        userIdSpan.textContent = currentUserId;
        userIdDisplay.classList.remove('hidden');
        startFirestoreListener();
    } else {
        try {
            showLoading();
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }
        } catch (error) {
            console.error("Error signing in:", error);
            currentUserId = null;
            userIdDisplay.classList.add('hidden');
            displayErrorMessage('Autentikasi gagal. Silakan refresh halaman.');
        } finally {
            hideLoading();
        }
    }
});

// --- Firestore Listener ---
let unsubscribeFromSessions = null; // To store the unsubscribe function

function startFirestoreListener() {
    if (currentUserId && db) {
        if (unsubscribeFromSessions) {
            unsubscribeFromSessions(); // Unsubscribe from previous listener if exists
        }

        const sessionsCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/teachingSessions`);
        const q = query(sessionsCollectionRef, orderBy('timestamp', 'desc'));

        unsubscribeFromSessions = onSnapshot(q, (snapshot) => {
            allSessions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            renderSessions();
            updateSummary();
            updateDatalists();
        }, (error) => {
            console.error("Error fetching teaching sessions:", error);
            displayErrorMessage('Gagal memuat sesi. Coba lagi.');
        });
    }
}

// --- Form Management ---
function resetForm() {
    sessionDateInput.value = new Date().toISOString().split('T')[0];
    studentNameInput.value = '';
    topicInput.value = '';
    durationInput.value = '';
    feeInput.value = '';
    editingSessionId = null;
    formTitle.textContent = 'Tambahkan Sesi Baru';
    saveSessionBtn.textContent = 'Tambahkan Sesi';
    cancelEditBtn.classList.add('hidden');
    hideMessages();
}

// --- Save/Update Session ---
saveSessionBtn.addEventListener('click', async () => {
    const date = sessionDateInput.value;
    const student = studentNameInput.value.trim();
    const sessionTopic = topicInput.value.trim();
    const sessionDuration = parseFloat(durationInput.value);
    const sessionFee = parseFloat(feeInput.value);

    if (!date || !student || !sessionTopic || isNaN(sessionDuration) || isNaN(sessionFee) || sessionDuration <= 0 || sessionFee < 0) {
        displayErrorMessage('Semua kolom harus diisi dengan benar.');
        return;
    }
    if (!currentUserId) {
        displayErrorMessage('Pengguna belum terautentikasi. Silakan refresh halaman.');
        return;
    }

    hideMessages();
    showLoading();

    const sessionData = {
        date: date,
        studentName: student,
        topic: sessionTopic,
        duration: sessionDuration,
        fee: sessionFee,
        timestamp: new Date(),
    };

    try {
        if (editingSessionId) {
            await updateDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/teachingSessions`, editingSessionId), sessionData);
            displaySuccessMessage('Sesi berhasil diperbarui!');
        } else {
            await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/teachingSessions`), sessionData);
            displaySuccessMessage('Sesi berhasil ditambahkan!');
        }
        resetForm();
    } catch (e) {
        console.error("Error saving document: ", e);
        displayErrorMessage('Terjadi kesalahan saat menyimpan sesi. Coba lagi.');
    } finally {
        hideLoading();
    }
});

cancelEditBtn.addEventListener('click', resetForm);

// --- Edit Session ---
function handleEditSession(session) {
    editingSessionId = session.id;
    sessionDateInput.value = session.date;
    studentNameInput.value = session.studentName;
    topicInput.value = session.topic;
    durationInput.value = session.duration.toString();
    feeInput.value = session.fee.toString();

    formTitle.textContent = 'Edit Sesi';
    saveSessionBtn.textContent = 'Perbarui Sesi';
    cancelEditBtn.classList.remove('hidden');
    hideMessages();
}

// --- Delete Session Confirmation ---
function handleDeleteClick(sessionId) {
    sessionToDeleteId = sessionId;
    deleteConfirmModal.classList.remove('hidden');
    setTimeout(() => { // Add a slight delay for animation
        deleteConfirmModal.classList.add('active');
    }, 10);
}

confirmDeleteBtn.addEventListener('click', async () => {
    if (!sessionToDeleteId) return;

    if (!currentUserId) {
        displayErrorMessage('Pengguna belum terautentikasi. Silakan refresh halaman.');
        cancelDelete();
        return;
    }

    hideMessages();
    showLoading();

    try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/teachingSessions`, sessionToDeleteId));
        displaySuccessMessage('Sesi berhasil dihapus!');
        cancelDelete();
        if (editingSessionId === sessionToDeleteId) {
            resetForm();
        }
    } catch (e) {
        console.error("Error deleting document: ", e);
        displayErrorMessage('Terjadi kesalahan saat menghapus sesi. Coba lagi.');
        cancelDelete();
    } finally {
        hideLoading();
    }
});

cancelDeleteBtnModal.addEventListener('click', cancelDelete);

function cancelDelete() {
    deleteConfirmModal.classList.remove('active');
    setTimeout(() => { // Delay hiding the modal to allow animation
        deleteConfirmModal.classList.add('hidden');
    }, 300);
    sessionToDeleteId = null;
}

// --- Render Sessions List ---
function renderSessions() {
    sessionsList.innerHTML = ''; // Clear current list

    const filtered = allSessions.filter(session => {
        const matchesStudent = filterStudentNameInput.value ? session.studentName.toLowerCase().includes(filterStudentNameInput.value.toLowerCase()) : true;
        const matchesTopic = filterTopicInput.value ? session.topic.toLowerCase().includes(filterTopicInput.value.toLowerCase()) : true;

        const sessionDateTime = new Date(session.date).setHours(0,0,0,0);
        const startDate = filterStartDateInput.value ? new Date(filterStartDateInput.value).setHours(0,0,0,0) : null;
        const endDate = filterEndDateInput.value ? new Date(filterEndDateInput.value).setHours(23,59,59,999) : null;

        const matchesDate = (!startDate || sessionDateTime >= startDate) && (!endDate || sessionDateTime <= endDate);

        return matchesStudent && matchesTopic && matchesDate;
    });

    if (filtered.length === 0) {
        noSessionsMessage.classList.remove('hidden');
    } else {
        noSessionsMessage.classList.add('hidden');
        filtered.forEach(session => {
            const li = document.createElement('li');
            li.className = "bg-white p-4 rounded-xl shadow-md border-l-4 border-indigo-400 flex flex-col sm:flex-row justify-between items-start sm:items-center transform hover:scale-[1.02] transition-transform duration-200";
            li.innerHTML = `
                <div class="flex-1 mb-3 sm:mb-0">
                    <p class="font-medium text-gray-800 text-sm">
                        ${new Date(session.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                    <p class="text-lg text-indigo-600 font-semibold">${session.studentName}</p>
                    <p class="text-gray-700 text-sm">Topik: <span class="font-medium">${session.topic}</span></p>
                    <p class="text-gray-700 text-sm">Durasi: <span class="font-medium">${session.duration} jam</span></p>
                    <p class="text-green-700 font-bold text-lg mt-1">Rp${session.fee.toLocaleString('id-ID')}</p>
                </div>
                <div class="flex space-x-2 self-end sm:self-center">
                    <button data-id="${session.id}" class="edit-btn bg-yellow-100 text-yellow-700 p-2 rounded-full hover:bg-yellow-200 transition duration-200 shadow-sm" title="Edit Sesi">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.38-2.828-2.829z" />
                        </svg>
                    </button>
                    <button data-id="${session.id}" class="delete-btn bg-red-100 text-red-700 p-2 rounded-full hover:bg-red-200 transition duration-200 shadow-sm" title="Hapus Sesi">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            `;
            sessionsList.appendChild(li);

            // Add event listeners to the newly created buttons
            li.querySelector('.edit-btn').addEventListener('click', () => handleEditSession(session));
            li.querySelector('.delete-btn').addEventListener('click', () => handleDeleteClick(session.id));
        });
    }
}

// --- Update Summary ---
function updateSummary() {
    const totalEarnings = allSessions.reduce((acc, session) => acc + session.fee, 0);
    totalEarningsElement.textContent = `Rp${totalEarnings.toLocaleString('id-ID')}`;
}

// --- Update Datalists for Auto-Suggest ---
function updateDatalists() {
    const uniqueStudents = new Set();
    const uniqueTopics = new Set();
    allSessions.forEach(session => {
        uniqueStudents.add(session.studentName);
        uniqueTopics.add(session.topic);
    });

    studentNamesDatalist.innerHTML = '';
    Array.from(uniqueStudents).sort().forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        studentNamesDatalist.appendChild(option);
    });

    topicsDatalist.innerHTML = '';
    Array.from(uniqueTopics).sort().forEach(topic => {
        const option = document.createElement('option');
        option.value = topic;
        topicsDatalist.appendChild(option);
    });
}

// --- Filter Event Listeners (Auto-apply) ---
filterStudentNameInput.addEventListener('input', renderSessions);
filterTopicInput.addEventListener('input', renderSessions);
filterStartDateInput.addEventListener('input', renderSessions);
filterEndDateInput.addEventListener('input', renderSessions);
clearAllFiltersBtn.addEventListener('click', () => {
    filterStudentNameInput.value = '';
    filterTopicInput.value = '';
    filterStartDateInput.value = '';
    filterEndDateInput.value = '';
    renderSessions(); // Re-render to show all sessions
});

// Set default date for new session on load
sessionDateInput.value = new Date().toISOString().split('T')[0];

