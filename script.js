const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0, ARCHIVED_RECORDS = [], POTENTIAL_MATCHES = [], HUB_ACTIVITY = [];
let MY_PHONE = localStorage.getItem("userPhone");
let MY_NAME = ""; 
let IS_SYNCING = false;
let LIVE_FEED_PAGE = 1;
let LIVE_FEED_TOTAL_PAGES = 1;


$(document).ready(() => {
    loadData();
    setInterval(professionalSync, 60000);
    
    $('#modalFullFeed').on('shown.bs.modal', function () {
        loadLiveFeed(1, 100, '#fullFeedContainer');
    });
    
    $('a[data-toggle="pill"][href="#paneFeedback"]').on('shown.bs.tab', function (e) {
        loadFeedback();
    });
     $('a[data-toggle="pill"][href="#paneActivity"]').on('shown.bs.tab', function (e) {
        loadMyActivity();
    });
});

// --- SYNC & DATA LOADING ---

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
        
        renderTable(); 
        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        renderArchiveTable(ARCHIVED_RECORDS);
        setTimeout(updateMatches, 200);

        showSlimProgress(100);
    } catch (e) {
        console.warn("Background sync failed.", e);
    } finally {
        setTimeout(() => { IS_SYNCING = false; hideSlimProgress(); }, 1000);
    }
}

function loadData() {
    $("#globalLoader").removeClass("d-none");
    fetch(`${API}?action=getDashboardData&t=${Date.now()}`)
    .then(r => r.json())
    .then(response => {
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        ARCHIVED_RECORDS = response.archivedRecords || [];
        
        loadLiveFeed(1, 5, '#hubActivityList'); 

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        if (MY_PHONE) {
            const currentUser = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));
            if (currentUser) {
                MY_NAME = currentUser['Your Name'] || "User";
                $('#idContainer').removeClass('d-none');
                $('#lblUserPhone').text(MY_PHONE.slice(0, 2) + '****' + MY_PHONE.slice(-2));
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
        loadFeedback();
        setTimeout(updateMatches, 200);
        $("#globalLoader").addClass("d-none");
    })
    .catch(err => {
        console.error("Critical Load Error:", err);
        $("#globalLoader").addClass("d-none");
        alert("Unable to load data. Please check your connection.");
    });
}

// --- STATS & MATCHING LOGIC ---

function updateStats(data, archivedCount) {
    const uniqueUsers = [...new Set(data.map(x => String(x.phone)))].length;
    const totalRequests = data.length;
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

    const myEntries = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    
    const myCriteria = myEntries.flatMap(me => {
        const working = String(me['Working District']).trim().toUpperCase();
        const willing = String(me['Willing District']).trim().toUpperCase();
        return { working, willing };
    });

    POTENTIAL_MATCHES = MASTER_DATA.filter(r => {
        if (String(r.phone) === String(MY_PHONE)) return false; 
        
        const theirWorking = String(r['Working District']).trim().toUpperCase();
        const theirWilling = String(r['Willing District']).trim().toUpperCase();
        
        return myCriteria.some(me => theirWorking === me.willing && theirWilling === me.working);
    });
    
    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i>My Matches <span class="badge badge-light ml-1">${POTENTIAL_MATCHES.length}</span>`);
    if (FILTER_MATCHES) renderTable();
}


// --- RENDERING FUNCTIONS ---

function renderTable() {
    const selectedDesig = $('#selDesignation').val();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();

    let dataToRender;

    if (FILTER_MATCHES) {
        const myPhone = String(MY_PHONE);
        const myEntries = MASTER_DATA.filter(r => String(r.phone) === myPhone);
        
        const matchPhones = POTENTIAL_MATCHES.map(m => String(m.phone));
        const matchEntries = MASTER_DATA.filter(r => matchPhones.includes(String(r.phone)));

        const allRelevantEntries = [...myEntries, ...matchEntries];
        dataToRender = [...new Map(allRelevantEntries.map(item => [item.id, item])).values()];
    } else {
        dataToRender = MASTER_DATA;
    }

    const filtered = dataToRender.filter(r => 
        (selectedDesig === 'all' || r['Your Designation'] === selectedDesig) &&
        (from === 'all' || r['Working District'] === from) &&
        (to === 'all' || r['Willing District'] === to)
    );
    renderTableToDOM(filtered);
}

function renderTableToDOM(data) {
    const tbody = $('#mainTbody').empty();
    $('#noData').toggleClass('d-none', data.length > 0);
    
    if (data.length === 0) {
        $('#noData').html('<img src="https://cdn-icons-png.flaticon.com/512/7486/7486744.png" alt="No data" width="80" class="mb-3 opacity-50"><h6 class="text-muted font-weight-bold">No results for your criteria</h6>');
        return;
    }

    let rowsHtml = "";
    data.forEach((row, index) => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const matchStat = (row.MATCH_STATUS || "").toUpperCase();
        const hasMatch = matchStat.includes("MATCH");
        
        let demandCfg = { c: 'lvl-mod', d: '#f59e0b' };
        const dStatus = (row.DEMAND_STATUS || '').toUpperCase();
        if (dStatus.includes('HIGH')) demandCfg = { c: 'lvl-high', d: '#ef4444' };
        if (dStatus.includes('LOW')) demandCfg = { c: 'lvl-low', d: '#10b981' };

        let statusMarkup = `<span class="badge badge-pill badge-light text-muted border">PENDING</span>`;
        if (hasMatch) {
            statusMarkup = `<span class="badge badge-pill ${matchStat.includes("3-WAY") ? 'badge-secondary' : 'badge-success'}"><i class="fas fa-lock mr-1"></i>${matchStat.includes("3-WAY") ? '3-WAY' : 'DIRECT'} MATCH</span>`;
        }
        
        let deleteConcernMarkup = '<span class="text-muted small">N/A</span>';
        if (isMe && hasMatch) {
            const myRecord = MASTER_DATA.find(x => x.id === row.id);
            const partnerRecord = MASTER_DATA.find(p => p.id === myRecord.MATCH_ID && p.phone !== MY_PHONE);
            
            if (myRecord.DELETE_REQUEST === 'REQUESTED') {
                deleteConcernMarkup = `<div class="badge-pending-approval"><i class="fas fa-hourglass-half mr-2"></i>Request Sent</div>`;
            } else if (partnerRecord && partnerRecord.DELETE_REQUEST === 'REQUESTED') {
                deleteConcernMarkup = `<button class="btn btn-sm btn-glow-success rounded-pill px-3" onclick="approveDeletion()"><i class="fas fa-check-double mr-1"></i>Approve Request</button>`;
            } else {
                deleteConcernMarkup = `<button class="btn btn-sm btn-outline-warning rounded-pill px-3" onclick="requestDeletion()"><i class="fas fa-trash-alt mr-1"></i>Request Deletion</button>`;
            }
        }

        rowsHtml += `
            <tr class="${isMe ? 'row-identity' : ''}" data-id="${row.id}">
                <td>${index + 1}</td>
                <td><div class="font-weight-bold text-dark">${row['Your Designation']}</div>${isMe ? '<div class="text-primary font-weight-bold" style="font-size:0.65rem;">MY ENTRY</div>' : ''}</td>
                <td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td>
                <td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${row['Willing District']}</strong></td>
                <td class="d-table-cell"><div class="demand-pill ${demandCfg.c}"><span class="pulse-dot-small" style="background:${demandCfg.d};"></span> ${row.DEMAND_STATUS || 'Moderate'}</div></td>
                <td>${statusMarkup}</td>
                <td class="text-center"><button class="btn btn-unlock shadow-sm ${!hasMatch ? 'opacity-50' : 'btn-hover-grow'}" onclick="unlockRow('${row.id}', ${hasMatch})"><i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock text-white-50'} "></i></button></td>
                <td>${deleteConcernMarkup}</td>
            </tr>`;
    });
    tbody.html(rowsHtml);
}


function renderArchiveTable(archivedRecords) {
    const tbody = $('#archiveTbody').empty();
    $('#noArchiveData').toggleClass('d-none', archivedRecords.length === 0);

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

function openEditModal() {
    if (!MY_PHONE) {
        showToast("Please log in to edit your profile.", "error");
        return;
    }
    // Redirect to the registration page with phone number as a parameter
    window.location.href = `testreg.html?phone=${MY_PHONE}`;
}

async function unlockRow(id, active) {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    if (!active) { showToast("Match required to view contact", "info"); return; }
    
    $("#globalLoader").removeClass("d-none");
    try {
        const res = await fetch(API, { method: "POST", body: JSON.stringify({ action: "getContact", rowId: id, userPhone: MY_PHONE }) });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        $('#resName').text(data.name || "N/A"); 
        $('#resPhone').text(data.contact || "N/A");
        $('#callLink').attr("href", "tel:" + data.contact);
        $('#waLink').attr("href", "https://wa.me/91" + data.contact);
        $('#modalContact').modal('show'); 
        
        showToast("Contact Unlocked!", "success");
    } catch(e) { 
        showToast(`Error: ${e.message}`, "error"); 
    } finally {
        $("#globalLoader").addClass("d-none");
    }
}

function deleteMyEntry() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    const myRecords = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    if (myRecords.some(r => (r.MATCH_STATUS || "").toUpperCase().includes("MATCH"))) {
        showToast("For matched profiles, please use the 'Request Deletion' option in the table.", "info");
        return;
    }
    $('#modalDeleteConfirm').modal('show');
}

async function executeDeletion() {
    let reason = $('input[name="delReason"]:checked').val();
    if (reason === "OTHER") reason = $('#deleteReasonOther').val().trim();
    if (!reason) { alert("Please select or provide a reason."); return; }

    if (!confirm(`Are you sure you want to delete your profile? This cannot be undone.`)) return;

    await callApi({ action: "deleteEntry", reason: reason}, "Deleting Profile...", "Profile successfully deleted.", () => { clearIdentity(true); setTimeout(() => location.reload(), 500); });
}

function requestDeletion() { callApi({ action: "requestDelete" }, "Requesting deletion...", "Deletion request sent. Your partner must approve.", professionalSync); }
function approveDeletion() { callApi({ action: "approveDelete" }, "Approving deletion...", "Mutual deletion successful. Both profiles removed.", () => { setTimeout(() => location.reload(), 500); }); }

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
    if (!MY_PHONE) {
        $('#modalVerify').modal('show');
        return;
    }
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
            loadFeedback();
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

function showSlimProgress(percent) { if (!$('#slim-progress').length) { $('body').append('<div id="slim-progress" style="position:fixed;top:0;left:0;height:3px;background:#4f46e5;z-index:9999;transition:width .4s ease;"></div>'); } $('#slim-progress').css('width', percent + '%').show(); }
function hideSlimProgress() { $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%')); }
function toggleMatches() { if (!MY_PHONE) { $('#modalVerify').modal('show'); return; } FILTER_MATCHES = !FILTER_MATCHES; $('#btnMatches').toggleClass('btn-primary text-white', FILTER_MATCHES).toggleClass('btn-outline-primary', !FILTER_MATCHES); renderTable(); }

function buildFilters() {
    const desigSet = [...new Set(MASTER_DATA.map(x => x['Your Designation']))].filter(Boolean).sort();
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].filter(Boolean).sort();
    const toSet = [...new Set(MASTER_DATA.flatMap(x => x['Willing District'].split(',').map(d=>d.trim())))].filter(Boolean).sort();

    const build = (id, set) => { $(id).html('<option value="all">All</option>').prop('disabled', false).append(set.map(v => `<option value="${v}">${v}</option>`).join('')); };
    build('#selDesignation', desigSet);
    build('#selFrom', fromSet);
    build('#selTo', [...new Set(toSet)]);
}

function saveVerify() { const val = $('#verifyPhone').val(); if (!/^\d{10}$/.test(val)) { alert("Invalid phone format."); return; } if (MASTER_DATA.some(x => String(x.phone) === String(val))) { localStorage.setItem("userPhone", val); location.reload(); } else { $('#loginError, #regSection').fadeIn(); } }
function showToast(message, type = 'success') { $('.custom-toast').remove(); const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'; const bgColor = type === 'success' ? '#10b981' : '#ef4444'; $(`<div class="custom-toast shadow-lg"><i class="fas ${icon} mr-2"></i><span>${message}</span></div>`).css({ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: bgColor, color: 'white', padding: '12px 24px', borderRadius: '50px', zIndex: '10000', fontWeight: '600', display: 'none' }).appendTo('body').fadeIn(400).delay(3000).fadeOut(400, function() { $(this).remove(); }); }
function clearIdentity(soft = false) { localStorage.removeItem("userPhone"); MY_PHONE = null; if (!soft) location.reload(); $('#idContainer').addClass('d-none'); }
function resetUI() { $('select.filter-control').val('all'); FILTER_MATCHES = false; $('#btnMatches').addClass('btn-outline-primary').removeClass('btn-primary text-white'); renderTable(); }
function selectRadio(id) { $(`#${id}`).prop('checked', true); $('#otherReasonWrapper').toggleClass('d-none', id !== 'r3'); }

// --- DATE & ACTIVITY FEED FUNCTIONS ---
function parseDateString(dateString) {
    if (!dateString) return null;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (isoRegex.test(dateString) || !isNaN(new Date(dateString).getTime())) {
        return new Date(dateString);
    }
    const parts = dateString.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (!parts) return null;

    let day, month, year;
    if (parseInt(parts[1], 10) > 12) { // DD/MM/YY(YY)
        day = parseInt(parts[1], 10);
        month = parseInt(parts[2], 10) - 1;
        year = parseInt(parts[3], 10);
    } else { // MM/DD/YY(YY) or ambiguous
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
        year = parseInt(parts[3], 10);
    }
    if (year < 100) {
        year += (year > 50 ? 1900 : 2000);
    }
    const hour = parts[4] ? parseInt(parts[4], 10) : 0;
    const minute = parts[5] ? parseInt(parts[5], 10) : 0;
    const second = parts[6] ? parseInt(parts[6], 10) : 0;
    
    return new Date(year, month, day, hour, minute, second);
}


const formatDisplayDate = (dateString) => {
    if (!dateString) return 'Recently';
    const date = parseDateString(dateString);
    if (!date || isNaN(date)) return dateString;
    
    const now = new Date();
    const diffSeconds = Math.round((now - date) / 1000);

    if (diffSeconds < 0) {
         return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    }
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

function renderActivity(containerId, activities) {
    const container = $(containerId).empty();
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

async function loadLiveFeed(page, pageSize = 10, containerId = '#fullFeedContainer') {
    const container = $(containerId);
    container.html('<div class="text-center p-5"><div class="spinner-border text-primary" role="status"><span class="sr-only">Loading...</span></div></div>');
    try {
        const r = await fetch(`${API}?action=getLiveFeed&page=${page}&pageSize=${pageSize}&t=${Date.now()}`);
        const res = await r.json();
        
        if (res.error) throw new Error(res.error);

        HUB_ACTIVITY = res.activities || [];
        LIVE_FEED_PAGE = res.page;
        LIVE_FEED_TOTAL_PAGES = res.totalPages;
        
        renderActivity(containerId, HUB_ACTIVITY);
        
        if (containerId === '#fullFeedContainer') {
            updateFeedPagination();
        }

    } catch (err) {
        console.error("Live Feed Error:", err);
        container.html('<div class="text-center p-4 text-danger border rounded-24">Failed to load live feed.</div>');
    }
}

function updateFeedPagination() {
    $('#feedPageInfo').text(`Page ${LIVE_FEED_PAGE} of ${LIVE_FEED_TOTAL_PAGES}`);
    $('#btnFeedPrev').prop('disabled', LIVE_FEED_PAGE <= 1);
    $('#btnFeedNext').prop('disabled', LIVE_FEED_PAGE >= LIVE_FEED_TOTAL_PAGES);
}

function showFullFeed(){
    $('#modalFullFeed').modal('show');
}

async function loadMyActivity() {
    if (!MY_PHONE) {
        renderActivity('#myActivityList', []);
        return;
    }
    try {
        const r = await fetch(`${API}?action=getUserUpdateHistory&userPhone=${MY_PHONE}`);
        const activities = await r.json();
        renderActivity('#myActivityList', activities);
    } catch (err) {
        console.error("My Activity Error:", err);
        $('#myActivityList').html('<div class="text-center p-4 text-danger border rounded-24">Failed to load activity.</div>');
    }
}

function showInviteModal() {
    const message = `Check out this Mutual Transfer platform to find your transfer partner! Link: ${window.location.href}`;
    $('#whatsappMessage').val(message);
    $('#modalInvite').modal('show');
}

function shareToWhatsApp() {
    const message = encodeURIComponent($('#whatsappMessage').val());
    window.open(`https://wa.me/?text=${message}`, '_blank');
}

function openRegistrationModal() {
    window.location.href = 'testreg.html';
}

async function submitRegistration() {
     const userData = {
        name: $('#regName').val(),
        designation: $('#regDesignation').val(),
        doj: $('#regDoj').val(),
        workingDistrict: $('#regCurrentDist').val(),
        willingDistrict: $('#regWillingDist').val(),
        phone: $('#regPhone').val(),
        email: $('#regEmail').val(),
        probation: $('input[name="probation"]:checked').val(),
        coa: $('input[name="coa"]:checked').val(),
    };
    await callApi(
        { action: "register", userData: userData }, 
        "Registering...", 
        "Registration successful!", 
        () => {
            localStorage.setItem("userPhone", userData.phone);
            setTimeout(() => window.location.href = 'testdash.html', 500); 
        }
    );
}
