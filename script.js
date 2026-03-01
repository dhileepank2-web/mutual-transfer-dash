/**
 * MUTUAL TRANSFER HUB - CORE ENGINE
 * Manages state, background synchronization, matching logic, and UI orchestration.
 */

// --- GLOBAL STATE & CONFIG ---
const API = "https://script.google.com/macros/s/AKfycbxST_AqkRH0OUBLvp1DWcFoujqlFIF1mi-yrVvCd3E1jq97XP_6k2MLgreOE0MGs0LA/exec";
const ADMIN_PHONE = "9080141350";
let MASTER_DATA = [];
let FILTER_MATCHES = false;
let FILTER_ALL_MATCHES = false;
let ARCHIVE_COUNT = 0;
let ARCHIVED_RECORDS = [];
let POTENTIAL_MATCHES = [];
let HUB_ACTIVITY = [];
let MY_PHONE = localStorage.getItem("userPhone");
let MY_NAME = ""; 
let IS_SYNCING = false;
let MAIN_TABLE_CURRENT_PAGE = 1;
const MAIN_TABLE_PAGE_SIZE = 100;

// --- NEW HELPER FUNCTIONS ---
/**
 * Unpacks master data so each willing district has its own row.
 * @param {Array} data The original MASTER_DATA.
 * @returns {Array} A new, flattened array of records.
 */
function unpackMasterData(data) {
    const unpacked = [];
    if (!data) return unpacked;

    data.forEach(row => {
        const willingDistricts = (row['Willing District'] || '').split(',').map(d => d.trim()).filter(Boolean);
        if (willingDistricts.length > 0) {
            willingDistricts.forEach(district => {
                // Create a new object for each willing district
                unpacked.push({
                    ...row, // Copy all original data
                    'Willing District': district, // Override with the single district
                });
            });
        } else {
            // Keep users even if they have no willing district listed
            unpacked.push({
                ...row
            });
        }
    });
    return unpacked;
}

/**
 * Extracts a specific status from a pipe-separated status string.
 * @param {string} statusString The string like "DIST1:STATUS | DIST2:STATUS".
 * @param {string} district The district to find the status for.
 * @param {string} defaultValue The value to return if not found.
 * @returns {string} The specific status string (e.g., "STATUS(1)") or the default.
 */
function getSubStatus(statusString, district, defaultValue) {
    if (!statusString || !district) return defaultValue;
    const statuses = statusString.split('|');
    const upperDistrict = district.toUpperCase();
    const specificStatus = statuses.find(s => s.trim().toUpperCase().startsWith(upperDistrict));

    if (specificStatus) {
        const parts = specificStatus.split(':');
        if (parts.length > 1) {
            return parts[1].trim(); // Return only the status part, e.g., HIGH(5)
        }
    }
    return defaultValue;
}


// --- INITIALIZATION ---
$(document).ready(() => {
    loadData();
    
    // Background sync every 30 seconds
    setInterval(professionalSync, 30000);
    
    // Live feed refresh every 2 minutes if the page is visible and no modal is open
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);

    // Refresh feedback when tab is shown
    $('a[data-toggle="pill"][href="#paneFeedback"]').on('shown.bs.tab', function (e) {
        loadFeedback();
    });
    
    // Add event listener for the Hub Activity tab
    $('a[data-toggle="pill"][href="#paneHub"]').on('shown.bs.tab', function () {
        // Load the first page of the full, searchable feed when the tab is viewed
        loadHubActivityPage(1);
    });
});

// --- SYNC & DATA LOADING ---

/**
 * Perform a background sync without interrupting the user experience
 */
async function professionalSync() {
    if (IS_SYNCING || document.visibilityState !== 'visible') return;
    IS_SYNCING = true;
    showSlimProgress(30);

    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();
        
        MASTER_DATA = res.records || [];
        ARCHIVE_COUNT = res.archivedCount || 0;
        ARCHIVED_RECORDS = res.archivedRecords || [];
        HUB_ACTIVITY = res.publicHubActivity || [];
        
        renderTable(MAIN_TABLE_CURRENT_PAGE); 
        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        renderArchiveTable(ARCHIVED_RECORDS);
        
        // Only update the preview if the main hub isn't visible
        if (!$('#paneHub').is(':visible')) {
            renderActivity('#hubActivityList', HUB_ACTIVITY);
        }

        loadMyActivity();
        setTimeout(updateMatches, 200);

        showSlimProgress(100);
    } catch (e) {
        console.warn("Background sync failed.", e);
    } finally {
        setTimeout(() => { 
            IS_SYNCING = false; 
            hideSlimProgress(); 
        }, 1000);
    }
}

async function syncLiveFeed() {
    await professionalSync(); 
}

/**
 * Initial full data load with UI blocking loader
 */
function loadData() {
    $("#globalLoader").removeClass("d-none");
    fetch(`${API}?action=getDashboardData&t=${Date.now()}`)
    .then(r => r.json())
    .then(response => {
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        ARCHIVED_RECORDS = response.archivedRecords || [];
        HUB_ACTIVITY = response.publicHubActivity || [];
        
        // Render initial preview
        renderActivity('#hubActivityList', HUB_ACTIVITY);

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        if (MY_PHONE) {
            const currentUser = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));
            if (currentUser) {
                MY_NAME = currentUser['Your Name'] || "User";
                $('#idContainer').removeClass('d-none');
                $('#lblUserPhone').text(MY_PHONE.slice(0, 2) + '****' + MY_PHONE.slice(-2));
                
                if (MY_PHONE === ADMIN_PHONE) {

                    const adminBtn = $('#btnAdminPanel');
                
                    adminBtn.removeClass('d-none')
                        .addClass('btn-danger text-white font-weight-bold shadow');
                
                    adminBtn.html('<i class="fas fa-user-shield mr-2"></i> Admin Panel');
                
                    // remove any existing href that points to script
                    adminBtn.removeAttr('href');
                
                    // remove old handlers and add new one
                    adminBtn.off('click').on('click', function (event) {
                        event.preventDefault();
                        window.location.href = "admin.html?view=admin&userPhone=" + ADMIN_PHONE;
                    });
                }

            } else {
                clearIdentity(true);
            }
        } else {
             $('#modalVerify').modal('show');
        }

        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        buildFilters();
        renderTable();
        renderArchiveTable(ARCHIVED_RECORDS);
        loadActivityLog(); 
        loadMyActivity();
        loadFeedback();
        setTimeout(updateMatches, 200);
        $("#globalLoader").addClass("d-none");
    })
    .catch(err => {
        console.error("Critical Load Error:", err);
        $("#globalLoader").addClass("d-none");
        showToast("Unable to load data. Please check connection.", "error");
    });
}

// --- HUB ACTIVITY SEARCH & PAGINATION ---

/**
 * Fetches and renders a specific page of the Hub Activity feed.
 * Handles both pagination and search queries.
 * @param {number} [page=1] - The page number to fetch.
 */
async function loadHubActivityPage(page = 1) {
    const searchTerm = ''; // Search functionality removed
    
    $('#hubActivityList').html('<div class="text-center p-5 text-muted"><div class="spinner-border spinner-border-sm"></div> Loading Feed...</div>');
    $('#hubActivityPagination').empty();

    try {
        const response = await fetch(`${API}?action=getLiveFeed&page=${page}&pageSize=100&searchTerm=${encodeURIComponent(searchTerm)}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        renderActivity('#hubActivityList', data.activities || []);
        renderHubPagination(data.page, data.totalPages);

    } catch (err) {
        console.error("Hub Activity Load Error:", err);
        $('#hubActivityList').html('<div class="text-center p-5 text-danger">Failed to load activity feed. Please try again.</div>');
    }
}

/**
 * Renders the pagination controls for the Hub Activity feed.
 * @param {number} currentPage - The current active page.
 * @param {number} totalPages - The total number of pages available.
 */
function renderHubPagination(currentPage, totalPages) {
    const paginationContainer = $('#hubActivityPagination');
    paginationContainer.empty();
    if (totalPages <= 1) return;

    let paginationHtml = '';
    paginationHtml += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); loadHubActivityPage(${currentPage - 1});">« Prev</a></li>`;

    for (let i = 1; i <= totalPages; i++) {
        paginationHtml += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); loadHubActivityPage(${i});">${i}</a></li>`;
    }

    paginationHtml += `<li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); loadHubActivityPage(${currentPage + 1});">Next »</a></li>`;

    paginationContainer.html(paginationHtml);
}

// --- STATS & MATCHING LOGIC ---

function updateStats(data, archivedCount) {
    const uniqueUsers = [...new Set(data.map(x => String(x.phone)))].length;
    const totalRequests = unpackMasterData(data).length;
    const liveMatches = data.filter(r => (r.MATCH_STATUS || "").toUpperCase().includes("MATCH")).length;
    const totalLeaved = archivedCount;
    const overallSuccess = liveMatches + archivedCount;

    animateValue("statUnique", parseInt($('#statUnique').text()) || 0, uniqueUsers, 1000);
    animateValue("statTotal", parseInt($('#statTotal').text()) || 0, totalRequests, 1000);
    animateValue("statArchived", parseInt($('#statArchived').text()) || 0, totalLeaved, 1000);
    animateValue("statLiveMatches", parseInt($('#statLiveMatches').text()) || 0, liveMatches, 1000); 
    animateValue("statMatched", parseInt($('#statMatched').text()) || 0, overallSuccess, 1000);
}

function updateMatches() {
    if (!MY_PHONE) {
        POTENTIAL_MATCHES = [];
        $('#btnMatches').html('<i class="fas fa-handshake mr-1"></i>My Matches');
        return;
    }

    const myEntry = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));

    if (!myEntry || !myEntry.MATCH_ID) {
        POTENTIAL_MATCHES = [];
        $('#btnMatches').html('<i class="fas fa-handshake mr-1"></i>My Matches <span class="badge badge-light ml-1">0</span>');
        if (FILTER_MATCHES) renderTable();
        return;
    }

    const findRecordById = (id) => MASTER_DATA.find(p => String(p.id) === String(id));
    
    const allPartners = new Map();
    const partnersToExplore = String(myEntry.MATCH_ID).split(',').map(id => id.trim()).filter(Boolean);
    const exploredIds = new Set();
    
    // Start exploring from our direct partners
    while(partnersToExplore.length > 0) {
        const currentPartnerId = partnersToExplore.shift();

        // Skip if we've seen this partner or if it's ourselves
        if (exploredIds.has(currentPartnerId) || String(currentPartnerId) === String(myEntry.id)) {
            continue;
        }

        const partnerRecord = findRecordById(currentPartnerId);
        if (partnerRecord) {
            // Add to our list of confirmed partners and mark as explored
            allPartners.set(partnerRecord.id, partnerRecord);
            exploredIds.add(currentPartnerId);

            // Get the next partners in the chain from this partner
            const nextPartnerIds = String(partnerRecord.MATCH_ID || '').split(',').map(id => id.trim()).filter(Boolean);
            
            // Add them to the exploration queue if we haven't seen them
            nextPartnerIds.forEach(nextId => {
                if (!exploredIds.has(nextId)) {
                    partnersToExplore.push(nextId);
                }
            });
        }
    }

    POTENTIAL_MATCHES = Array.from(allPartners.values());

    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i>My Matches <span class="badge badge-light ml-1">${POTENTIAL_MATCHES.length}</span>`);

    if (FILTER_MATCHES) {
        renderTable();
    }
}


// --- RENDERING FUNCTIONS ---

function renderTable(page = 1) {
    MAIN_TABLE_CURRENT_PAGE = page;
    const selectedDesig = $('#selDesignation').val();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();

    let dataToRender = unpackMasterData(MASTER_DATA);

    if (FILTER_ALL_MATCHES) {
        dataToRender = dataToRender.filter(row => {
            const matchStatusStr = (row.MATCH_STATUS || "").toUpperCase();
            if (!matchStatusStr.includes("MATCH")) {
                return false;
            }
            const matchedStatuses = matchStatusStr.split('|').filter(s => s.includes("MATCH"));
            if (matchedStatuses.length === 0) return false;
            const matchedDistricts = matchedStatuses.map(s => s.split(':')[0].trim());
            const currentWillingDistrict = (row['Willing District'] || '').toUpperCase().trim();
            return matchedDistricts.includes(currentWillingDistrict);
        });
    } else if (FILTER_MATCHES) {
        if (!MY_PHONE) {
            dataToRender = [];
        } else {
            const matchPhones = POTENTIAL_MATCHES.map(m => String(m.phone));
            const allMatchRelatedPhones = [...new Set([MY_PHONE, ...matchPhones])];
            dataToRender = dataToRender.filter(r => allMatchRelatedPhones.includes(String(r.phone)));
        }
    }

    const filtered = dataToRender.filter(r =>
        (selectedDesig === 'all' || r['Your Designation'] === selectedDesig) &&
        (from === 'all' || r['Working District'] === from) &&
        (to === 'all' || r['Willing District'] === to)
    );

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / MAIN_TABLE_PAGE_SIZE);
    const startIndex = (page - 1) * MAIN_TABLE_PAGE_SIZE;
    const paginatedItems = filtered.slice(startIndex, startIndex + MAIN_TABLE_PAGE_SIZE);

    renderTableToDOM(paginatedItems, startIndex);
    renderMainTablePagination(page, totalPages);
}

function renderTableToDOM(data, startIndex = 0) {
    const tbody = $('#mainTbody').empty();
    $('#noData').toggleClass('d-none', data.length > 0);

    if (data.length === 0) {
        $('#noData').html('<img src="https://cdn-icons-png.flaticon.com/512/7486/7486744.png" alt="No data" width="80" class="mb-3 opacity-50"><h6 class="text-muted font-weight-bold">No results for your criteria</h6>');
        $('#mainTablePagination').empty();
        return;
    }

    let rowsHtml = "";
    data.forEach((row, index) => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const willingDistrict = row['Willing District']; // This is now a single district

        // Get status specific to this willing district
        const demandStatus = getSubStatus(row.DEMAND_STATUS, willingDistrict, 'N/A');
        const matchStatus = getSubStatus(row.MATCH_STATUS, willingDistrict, 'PENDING').toUpperCase();

        const hasMatch = matchStatus.includes("MATCH");

        // Demand Pill styling
        let demandCfg = { c: 'lvl-mod', d: '#f59e0b' };
        if (demandStatus.includes('HIGH')) demandCfg = { c: 'lvl-high', d: '#ef4444' };
        if (demandStatus.includes('LOW')) demandCfg = { c: 'lvl-low', d: '#10b981' };
        
        // Match Status Pill styling
        let statusMarkup = `<span class="status-pill status-pending">PENDING</span>`;
        if (hasMatch) {
            if (matchStatus.includes("3-WAY")) {
                statusMarkup = `<span class="status-pill status-3-way"><i class="fas fa-lock mr-1"></i>3-WAY MATCH</span>`;
            } else { // Direct match
                statusMarkup = `<span class="status-pill status-matched"><i class="fas fa-lock mr-1"></i>DIRECT MATCH</span>`;
            }
        }
        
        let deleteConcernMarkup = '<span class="text-muted small">N/A</span>';
        if (isMe) {
            // This logic can stay as it is since it's per-user not per-district
            if (row.DELETE_REQUEST === 'REQUESTED') {
                 deleteConcernMarkup = `<div class="badge-pending-approval"><i class="fas fa-hourglass-half mr-2"></i>Request Sent</div>`;
            } else {
                 deleteConcernMarkup = `<button class="btn btn-sm btn-outline-warning rounded-pill px-3" onclick="requestDeletion()"><i class="fas fa-trash-alt mr-1"></i>Request Deletion</button>`;
            }
        }

        const isMyPartner = POTENTIAL_MATCHES.some(p => String(p.id) === String(row.id));
        const canUnlock = hasMatch || isMyPartner; // You can always unlock a matched profile
        
        let connectButton;
        if (isMe) {
            connectButton = `<button class="btn btn-unlock shadow-sm btn-hover-grow" onclick="unlockRow('${row.id}', true)"><i class="fas fa-user-check"></i></button>`;
        } else {
            connectButton = `<button class="btn btn-unlock shadow-sm ${!canUnlock ? 'opacity-50' : 'btn-hover-grow'}" onclick="unlockRow('${row.id}', ${canUnlock})"><i class="fas ${canUnlock ? 'fa-lock-open' : 'fa-lock text-white-50'} "></i></button>`;
        }

        rowsHtml += `
            <tr class="${isMe ? 'row-identity' : ''}" data-id="${row.id}">
                <td>${startIndex + index + 1}</td>
                <td><div class="font-weight-bold text-dark">${isMe ? '<i class="fas fa-user-circle text-primary mr-2" title="This is you"></i>' : ''}${row['Your Name']}</div><div class="text-muted small">${row['Your Designation']}</div></td>
                <td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td>
                <td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${willingDistrict}</strong></td>
                <td><div class="demand-pill ${demandCfg.c}"><span class="pulse-dot-small" style="background:${demandCfg.d};"></span> ${demandStatus}</div></td>
                <td>${statusMarkup}</td>
                <td class="text-center">${connectButton}</td>
                <td>${deleteConcernMarkup}</td>
            </tr>`;
    });
    tbody.html(rowsHtml);
}

function renderMainTablePagination(currentPage, totalPages) {
    const paginationContainer = $('#mainTablePagination');
    paginationContainer.empty();
    if (totalPages <= 1) return;

    let paginationHtml = '';
    paginationHtml += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); renderTable(${currentPage - 1});">« Prev</a></li>`;

    for (let i = 1; i <= totalPages; i++) {
        paginationHtml += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); renderTable(${i});">${i}</a></li>`;
    }

    paginationHtml += `<li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); renderTable(${currentPage + 1});">Next »</a></li>`;

    paginationContainer.html(paginationHtml);
}

function renderArchiveTable(archivedRecords) {
    const tbody = $('#archiveTbody').empty();
    $('#noArchiveData').toggleClass('d-none', archivedRecords.length > 0);
    if (archivedRecords.length === 0) return;

    archivedRecords.forEach((row, index) => {
        tbody.append(`
            <tr>
                <td>${index + 1}</td>
                <td><div class="font-weight-bold text-dark">${row['Your Designation'] || 'Employee'}</div><small class="text-muted">ID: ${row.id || 'N/A'}</small></td>
                <td>${row['Working District']} → ${row['Willing District']}</td>
                <td><span class="badge badge-success">${row.reason || 'SUCCESS'}</span></td>
            </tr>
        `);
    });
}

// --- API & ACTION FUNCTIONS ---

async function unlockRow(id, active) {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }

    const targetRecord = MASTER_DATA.find(r => String(r.id) === String(id));
    const isMe = targetRecord && String(targetRecord.phone) === String(MY_PHONE);

    if (!isMe && !active) {
        showToast("This profile is not your match.", "error");
        return;
    }

    $("#globalLoader").removeClass("d-none");
    try {
        let profile;
        if (isMe) {
            const res = await fetch(`${API}?action=getUserProfile&userPhone=${MY_PHONE}`);
            profile = await res.json();
        } else {
            const res = await fetch(API, { 
                method: "POST", 
                body: JSON.stringify({ action: "getContact", rowId: id, userPhone: MY_PHONE })
            });
            const data = await res.json();
            if (data.status !== "SUCCESS") throw new Error(data.error || "Failed to get partner data.");
            profile = data.partnerProfile;
        }

        if (!profile || profile.error) throw new Error(profile.error || "Failed to get profile data.");

        $('#profName').text(profile.name || profile["Your Name"]);
        $('#profDesig').text(profile.designation || profile["Your Designation"]);
        $('#profPhone').text(profile.phone);
        $('#profDoj').text(profile.doj);
        $('#profWorking').text(profile.workingDistrict || profile["Working District"]);
        $('#profWilling').text(profile.willingDistrict || profile["Willing District"]);
        $('#profProbation').text(profile.probation);
        $('#profCoa').text(profile.coa);
        $('#profEmail').text(profile.email);

        if (isMe) {
            $('#myProfileBadge').show();
            $('.profile-header-actions').hide();
        } else {
            $('#myProfileBadge').hide();
            $('.profile-header-actions').show();
            $('#profCallLink').attr("href", "tel:" + profile.phone);
            $('#profWaLink').attr("href", "https://wa.me/91" + profile.phone);
        }

        $('#modalProfile').modal('show');
        showToast(isMe ? "Viewing Your Profile" : "Partner Profile Unlocked!", "success");
    } catch(e) { 
        showToast(`Unlock Failed: ${e.message}`, "error"); 
    } finally {
        $("#globalLoader").addClass("d-none");
    }
}

function deleteMyEntry() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    $('#modalDeleteConfirm').modal('show');
}

async function executeDeletion() {
    let reason = $('input[name="delReason"]:checked').val();
    if (reason === "OTHER") reason = $('#deleteReasonOther').val().trim();
    if (!reason) { alert("Please select or provide a reason."); return; }

    if (!confirm(`Are you sure you want to request deletion of your profile? This will be sent for admin approval.`)) return;

    await callApi({ action: "requestDelete", reason: reason }, "Requesting Deletion...", "Deletion request sent to admin for approval.", () => { 
        setTimeout(() => location.reload(), 500); 
    });
}

function requestDeletion() { 
    $('#modalDeleteConfirm').modal('show');
}

async function callApi(payload, loadingMsg, successMsg, callback) {
    $("#globalLoader").removeClass("d-none").find('h6').text(loadingMsg);
    try {
        const res = await fetch(API, { method: "POST", body: JSON.stringify({ ...payload, userPhone: MY_PHONE }) });
        const data = await res.json();
        if (data.status !== "SUCCESS") throw new Error(data.error || 'Unknown API error');
        showToast(successMsg, "success");
        if (callback) callback();
    } catch (e) { 
        showToast(`Error: ${e.message}`, "error");
    } finally {
        $("#globalLoader").addClass("d-none").find('h6').text("Processing...");
    }
}

// --- FEEDBACK FUNCTIONS ---
async function loadFeedback() {
    try {
        const response = await fetch(`${API}?action=getFeedback`);
        const feedbackData = await response.json();
        if (feedbackData.error) throw new Error(feedbackData.error);
        renderFeedback(feedbackData);
    } catch (err) {
        console.error("Feedback Load Error:", err);
        $('#feedbackContainer').html('<div class="col-12 text-center p-5 text-danger">Failed to load feedback.</div>');
    }
}

function renderFeedback(feedbackData) {
    const container = $('#feedbackContainer').empty();
    if (!feedbackData || feedbackData.length === 0) {
        container.html('<div class="col-12 text-center p-5 text-muted">No feedback yet. Be the first to share your thoughts!</div>');
        return;
    }

    feedbackData.forEach(item => {
        const repliesHtml = item.replies.map(reply => `
            <div class="feedback-reply" style="border-left: 3px solid #e9ecef; padding-left: 15px; margin-top: 15px; margin-left: 25px;">
                <p class="mb-1 text-dark" style="font-size: 0.9rem;">${reply.text}</p>
                <small class="text-muted"><i class="fas fa-user-circle fa-xs mr-1"></i>User (***${String(reply.phone).slice(-4)}) • ${formatDisplayDate(reply.timestamp)}</small>
            </div>
        `).join('');

        const card = `
            <div class="col-12 mb-3">
                <div class="feedback-card">
                    <div class="feedback-body">
                        <p class="font-weight-bold mb-1">${item.text}</p>
                        <small class="text-muted"><i class="fas fa-user fa-xs mr-1"></i>User (***${String(item.phone).slice(-4)}) • ${formatDisplayDate(item.timestamp)}</small>
                    </div>
                    ${repliesHtml ? `<div class="feedback-replies mt-3">${repliesHtml}</div>` : ''}
                    <div class="feedback-actions mt-3">
                        <button class="btn btn-sm btn-outline-primary rounded-pill py-1 px-3" onclick="showFeedbackModal('${item.id}')">
                            <i class="fas fa-reply fa-xs mr-1"></i> Reply
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.append(card);
    });
}

function showFeedbackModal(parentId = null) {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    $('#feedbackParentId').val(parentId || '');
    $('#txtFeedback').val('');
    const modalTitle = parentId ? 'Post a Reply' : 'Share Your Experience';
    $('#modalFeedback .modal-title').text(modalTitle);
    $('#modalFeedback').modal('show');
}

async function submitFeedback() {
    const feedbackText = $('#txtFeedback').val().trim();
    const parentId = $('#feedbackParentId').val();

    if (!feedbackText) {
        showToast('Please enter your feedback or reply.', 'error');
        return;
    }
    
    await callApi(
        { action: 'postFeedback', feedbackText, parentId },
        'Submitting...',
        'Feedback submitted successfully!',
        () => {
            $('#modalFeedback').modal('hide');
            loadFeedback(); // Refresh list without full reload
        }
    );
}

// --- UI & UTILITY FUNCTIONS ---

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id); 
    if (!obj || start === end) { if(obj) obj.innerHTML = end; return; } 
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp; 
        const progress = Math.min((timestamp - startTimestamp) / duration, 1); 
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function showSlimProgress(percent) { 
    if (!$('#slim-progress').length) { 
        $('body').append('<div id="slim-progress" style="position:fixed;top:0;left:0;height:3px;background:#4f46e5;z-index:9999;transition:width .4s ease;"></div>'); 
    } 
    $('#slim-progress').css('width', percent + '%').show(); 
}

function hideSlimProgress() { 
    $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%')); 
}

function toggleMatches() { 
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; } 
    FILTER_MATCHES = !FILTER_MATCHES;
    if (FILTER_MATCHES) FILTER_ALL_MATCHES = false;
    $('#btnMatches').toggleClass('btn-primary text-white', FILTER_MATCHES).toggleClass('btn-outline-primary', !FILTER_MATCHES); 
    $('#btnAllMatches').removeClass('btn-info text-white').addClass('btn-outline-info');
    renderTable(); 
}

function toggleAllMatches() {
    FILTER_ALL_MATCHES = !FILTER_ALL_MATCHES;
    if (FILTER_ALL_MATCHES) FILTER_MATCHES = false;
    $('#btnAllMatches').toggleClass('btn-info text-white', FILTER_ALL_MATCHES).toggleClass('btn-outline-info', !FILTER_ALL_MATCHES);
    $('#btnMatches').removeClass('btn-primary text-white').addClass('btn-outline-primary');
    renderTable();
}

function buildFilters() {
    const desigSet = [...new Set(MASTER_DATA.map(x => x['Your Designation']))].filter(Boolean).sort();
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].filter(Boolean).sort();
    const toSet = [...new Set(MASTER_DATA.flatMap(x => (x['Willing District'] || '').split(',').map(d=>d.trim())))].filter(Boolean).sort();

    const build = (id, set) => { 
        $(id).html('<option value="all">All</option>').prop('disabled', false).append(set.map(v => `<option value="${v}">${v}</option>`).join('')); 
    };
    build('#selDesignation', desigSet);
    build('#selFrom', fromSet);
    build('#selTo', toSet);
}

function saveVerify() { 
    const val = $('#verifyPhone').val(); 
    if (!/^\d{10}$/.test(val)) { alert("Invalid phone format."); return; } 
    if (MASTER_DATA.some(x => String(x.phone) === String(val))) { 
        localStorage.setItem("userPhone", val); 
        location.reload(); 
    } else { 
        $('#loginError, #regSection').fadeIn(); 
    } 
}

function showToast(message, type = 'success') { 
    $('.custom-toast').remove(); 
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'; 
    const bgColor = type === 'success' ? '#10b981' : '#ef4444'; 
    $(`<div class="custom-toast shadow-lg"><i class="fas ${icon} mr-2"></i><span>${message}</span></div>`)
    .css({ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: bgColor, color: 'white', padding: '12px 24px', borderRadius: '50px', zIndex: '10000', fontWeight: '600', display: 'none' })
    .appendTo('body').fadeIn(400).delay(3000).fadeOut(400, function() { $(this).remove(); }); 
}

function clearIdentity(soft = false) { 
    localStorage.removeItem("userPhone"); 
    MY_PHONE = null; 
    if (!soft) location.reload(); 
    $('#idContainer').addClass('d-none'); 
}

function resetUI() { 
    $('select.filter-control').val('all'); 
    FILTER_MATCHES = false;
    FILTER_ALL_MATCHES = false;
    $('#btnMatches').addClass('btn-outline-primary').removeClass('btn-primary text-white'); 
    $('#btnAllMatches').addClass('btn-outline-info').removeClass('btn-info text-white');
    renderTable(); 
}

function selectRadio(id) { 
    $(`#${id}`).prop('checked', true); 
    $('#otherReasonWrapper').toggleClass('d-none', id !== 'r3'); 
}

function editProfile() {
    if (MY_PHONE) {
        window.location.href = `testreg.html?editPhone=${MY_PHONE}`;
    } else {
        showToast("You must be logged in to edit your profile.", "error");
    }
}

function viewMyProfile() {
    if (!MY_PHONE) {
        showToast("You must be logged in to view your profile.", "error");
        return;
    }
    const myEntry = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));
    if (myEntry) {
        unlockRow(myEntry.id, true); 
    }
}

function viewFullActivity() {
    $('#hub-tab').tab('show');
}

// --- DATE & ACTIVITY FEED FUNCTIONS ---

function parseDateString(dateString) {
    if (!dateString) return null;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (isoRegex.test(dateString)) return new Date(dateString);

    const parts = dateString.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (!parts) return new Date(dateString);

    let day, month, year;
    if (parseInt(parts[1], 10) > 12) { 
        day = parseInt(parts[1], 10); month = parseInt(parts[2], 10) - 1; year = parseInt(parts[3], 10);
    } else { 
        month = parseInt(parts[1], 10) - 1; day = parseInt(parts[2], 10); year = parseInt(parts[3], 10);
    }

    if (String(year).length === 2) year += 2000;
    const h = parts[4] ? parseInt(parts[4], 10) : 0;
    const m = parts[5] ? parseInt(parts[5], 10) : 0;
    const s = parts[6] ? parseInt(parts[6], 10) : 0;
    
    return new Date(year, month, day, h, m, s);
}

const formatDisplayDate = (dateString) => {
    if (!dateString) return 'Recently';
    const date = parseDateString(dateString);
    if (!date || isNaN(date)) return dateString;
    
    const now = new Date();
    const diffSeconds = Math.round((now - date) / 1000);
    if (diffSeconds < 0) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(date);
};

function renderActivity(containerId, activities) {
    const container = $(containerId);
    container.empty();
    if (!activities || !activities.length) {
        container.html(`<div class="text-center p-4 text-muted border rounded-24">No activity to display.</div>`);
        return;
    }

    activities.sort((a, b) => {
        const dateA = parseDateString(a.date || a.time);
        const dateB = parseDateString(b.date || b.time);
        return (dateB || 0) - (dateA || 0);
    });

    activities.forEach((act, i) => {
        const time = formatDisplayDate(act.date || act.time);
        const type = (act.type || act.action || 'UPDATE').replace('_', ' ');
        const details = act.details || act.msg || 'No details available.';
        const user = act.user || (MY_PHONE ? `You (***${MY_PHONE.slice(-4)})` : 'System');

        container.append(`
            <div class="activity-item shadow-sm" style="animation-delay: ${i * 0.05}s">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="badge badge-primary text-uppercase">${type}</span>
                    <small class="text-muted">${time}</small>
                </div>
                <div class="font-weight-bold text-dark" style="font-size:0.9rem;">${details}</div>
                <div class="text-right mt-1"><small class="text-muted"><i class="fas fa-user-shield fa-xs mr-1"></i>${user}</small></div>
            </div>
        `);
    });
}

async function loadMyActivity() {
    if (!MY_PHONE) { renderActivity('#myActivityList', []); return; }
    try {
        const r = await fetch(`${API}?action=getUserUpdateHistory&userPhone=${MY_PHONE}`);
        const activities = await r.json();
        renderActivity('#myActivityList', activities);
    } catch (err) {
        console.error("My Activity Error:", err);
        $('#myActivityList').html('<div class="text-center p-4 text-danger border rounded-24">Failed to load activity.</div>');
    }
}

function loadActivityLog() {
    const container = $('#notificationList').empty();
    const audit = $('#auditLog').empty();
    if (!MY_PHONE) {
        container.append('<div class="text-center p-5 border rounded-24 bg-white"><p class="text-muted mb-0">Please log in to see notifications.</p></div>');
        return;
    }
    const myEntry = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));
    if (!myEntry) {
        container.append('<div class="text-center p-5 border rounded-24 bg-white"><p class="text-muted mb-0">No active registration found.</p></div>');
        return;
    }

    const hasMatch = (myEntry.MATCH_STATUS || '').toUpperCase().includes("MATCH");
    
    let matchedDistrictInfo = null;
    if(hasMatch) {
        const matchStatuses = (myEntry.MATCH_STATUS || '').split('|');
        const matchInfo = matchStatuses.find(s => s.toUpperCase().includes('MATCH'));
        if (matchInfo) {
            matchedDistrictInfo = {
                district: matchInfo.split(':')[0].trim(),
                status: matchInfo
            };
        }
    }

    const allWillingDistricts = (myEntry['Willing District'] || '').split(',').map(d => d.trim()).filter(Boolean);

    if (allWillingDistricts.length > 0) {
        allWillingDistricts.forEach(district => {
            if (matchedDistrictInfo && district.toUpperCase() === matchedDistrictInfo.district.toUpperCase()) {
                const is3Way = matchedDistrictInfo.status.toUpperCase().includes("3-WAY");
                container.append(`
                    <div class="history-card" style="border-left-color: ${is3Way ? '#7c3aed' : '#10b981'};">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <span class="badge ${is3Way ? 'badge-secondary' : 'badge-success'} mb-2">${is3Way ? '3-WAY MATCH' : 'DIRECT MATCH'}</span>
                                <h6 class="font-weight-bold mb-1">Transfer to ${district} Ready</h6>
                                <p class="small text-muted mb-0">A mutual match has been found for this request.</p>
                            </div>
                            <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="unlockRow('${myEntry.MATCH_ID}', true)">View Contact</button>
                        </div>
                    </div>`);
            } else {
                container.append(`
                    <div class="history-card" style="border-left-color: #cbd5e1;">
                        <div class="d-flex align-items-center">
                            <div class="spinner-grow spinner-grow-sm text-muted mr-3"></div>
                            <div><p class="mb-0 font-weight-bold">Searching for ${district}...</p></div>
                        </div>
                    </div>`);
            }
        });
    } else if (hasMatch && myEntry.MATCH_ID) {
         // Fallback for users with no willing districts but a match somehow
         const is3Way = (myEntry.MATCH_STATUS || '').toUpperCase().includes("3-WAY");
         container.append(`
            <div class="history-card" style="border-left-color: ${is3Way ? '#7c3aed' : '#10b981'};">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <span class="badge ${is3Way ? 'badge-secondary' : 'badge-success'} mb-2">MATCH FOUND</span>
                        <h6 class="font-weight-bold mb-1">Transfer Ready</h6>
                        <p class="small text-muted mb-0">A mutual match has been found.</p>
                    </div>
                    <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="unlockRow('${myEntry.MATCH_ID}', true)">View Contact</button>
                </div>
            </div>`);
    } else {
        container.append('<div class="text-center p-5 history-card"><p class="text-muted mb-0">You have no willing districts specified. Edit your profile to add some.</p></div>');
    }

    audit.html(`
        <div class="p-3 bg-white border rounded-15 mb-2 shadow-sm">
            <div class="font-weight-bold" style="font-size: 0.8rem;">Profile Verified</div>
            <div class="text-muted" style="font-size: 0.75rem;">Identity confirmed via ${MY_PHONE.slice(-4)}</div>
        </div>
        <div class="p-3 bg-white border rounded-15 shadow-sm">
            <div class="font-weight-bold" style="font-size: 0.8rem;">Syncing Districts</div>
            <div class="text-muted" style="font-size: 0.75rem;">Tracking ${allWillingDistricts.length} location(s)</div>
        </div>
    `);
}
