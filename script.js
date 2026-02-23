const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0, ARCHIVED_RECORDS = [], POTENTIAL_MATCHES = [];
let MY_PHONE = localStorage.getItem("userPhone");
let MY_NAME = ""; 
let IS_SYNCING = false;

$(document).ready(() => {
    loadData();
    setInterval(professionalSync, 30000);
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);
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
        renderHubActivity(res.publicHubActivity || []);
        loadMyActivity();
        renderFeedbacks(res.feedbacks || []);
        $('#lastUpdated').text(res.serverTime || new Date().toLocaleTimeString());
        
        setTimeout(updateMatches, 200);

        showSlimProgress(100);
    } catch (e) {
        console.warn("Background sync failed.", e);
    } finally {
        setTimeout(() => { IS_SYNCING = false; hideSlimProgress(); }, 1000);
    }
}

async function syncLiveFeed() {
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();

        if (MY_PHONE) {
            const oldMatchCount = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE) && (x.MATCH_STATUS || "").toUpperCase().includes("MATCH")).length;
            const newMatchCount = res.records.filter(x => String(x.phone) === String(MY_PHONE) && (x.MATCH_STATUS || "").toUpperCase().includes("MATCH")).length;
            if (newMatchCount > oldMatchCount) {
                showToast("🎉 Great news! A new mutual match has been found!", "success");
                if (window.navigator.vibrate) window.navigator.vibrate(200);
            }
        }

        MASTER_DATA = res.records;
        ARCHIVE_COUNT = res.archivedCount || 0;
        ARCHIVED_RECORDS = res.archivedRecords || [];
        renderTable();
        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        renderArchiveTable(ARCHIVED_RECORDS);
        renderHubActivity(res.publicHubActivity || []);
        loadMyActivity();
        renderFeedbacks(res.feedbacks || []);
        setTimeout(updateMatches, 200);
    } catch (e) { 
        console.warn("Silent sync failed.");
    }
}

function loadData() {
    fetch(`${API}?action=getDashboardData&t=${Date.now()}`)
    .then(r => r.json())
    .then(response => {
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        ARCHIVED_RECORDS = response.archivedRecords || [];

        renderHubActivity(response.publicHubActivity || []);
        renderFeedbacks(response.feedbacks || []);

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        if (MY_PHONE) {
            const currentUser = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));
            if (currentUser) {
                MY_NAME = currentUser['Your Name'] || "User";
                $('#idContainer').removeClass('d-none');
                $('#lblUserPhone').text(MY_PHONE.slice(0, 2) + '****' + MY_PHONE.slice(-2));
            } else {
                localStorage.removeItem("userPhone");
                MY_PHONE = null;
                $('#modalVerify').modal('show');
            }
        } else {
            $('#modalVerify').modal('show');
        }

        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        buildFilters();
        renderTable();
        renderArchiveTable(ARCHIVED_RECORDS);
        loadMyActivity();
        loadActivityLog();
        setTimeout(updateMatches, 200);
    })
    .catch(err => {
        console.error("Critical Load Error:", err);
        alert("Unable to load data. Please check your connection.");
    });
}

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
    const myCriteria = MASTER_DATA
        .filter(x => String(x.phone) === String(MY_PHONE) && !(x.MATCH_STATUS || "").toUpperCase().includes("MATCH"))
        .flatMap(me => {
            const working = String(me['Working District']).trim().toUpperCase();
            const willingDistricts = String(me['Willing District']).split(',').map(d => d.trim().toUpperCase()).filter(d => d);
            return willingDistricts.map(willing => ({
                working: working,
                willing: willing
            }));
        });

    POTENTIAL_MATCHES = MASTER_DATA.filter(r => {
        if (String(r.phone) === String(MY_PHONE) || (r.MATCH_STATUS || "").toUpperCase().includes("MATCH")) return false;
        const theirWorking = String(r['Working District']).trim().toUpperCase();
        const theirWillingDistricts = String(r['Willing District']).split(',').map(d => d.trim().toUpperCase()).filter(d => d);
        
        return myCriteria.some(me => {
            return (theirWorking === me.willing && theirWillingDistricts.includes(me.working));
        });
    });
    
    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i>My Matches <span class="badge badge-light ml-1">${POTENTIAL_MATCHES.length}</span>`);

    if (FILTER_MATCHES) {
        renderTable();
    }
}

function renderTable() {
    const selectedDesig = $('#selDesignation').val();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();

    const filtered = MASTER_DATA.filter(r => {
        const isOwn = String(r.phone) === String(MY_PHONE);
        const matchesDesig = selectedDesig === 'all' || r['Your Designation'] === selectedDesig;
        const matchesFrom = from === 'all' || r['Working District'] === from;
        const matchesTo = to === 'all' || r['Willing District'] === to;
        if (FILTER_MATCHES) {
            const isMatchForMe = POTENTIAL_MATCHES.some(m => m.id === r.id);
            return (isMatchForMe || isOwn) && matchesDesig && matchesFrom && matchesTo;
        }
        return matchesDesig && matchesFrom && matchesTo;
    });
    renderTableToDOM(filtered);
}

function renderTableToDOM(data) {
    const tbody = $('#mainTbody');
    const noData = $('#noData');
    tbody.empty();
    
    if(data.length === 0) {
        noData.removeClass('d-none').html('<img src="https://cdn-icons-png.flaticon.com/512/7486/7486744.png" alt="No data" width="80" class="mb-3 opacity-50"><h6 class="text-muted font-weight-bold">No results found for your criteria</h6>');
    } else {
        noData.addClass('d-none');
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
                if (matchStat.includes("3-WAY")) statusMarkup = `<span class="badge badge-pill badge-secondary"><i class="fas fa-lock mr-1"></i>3-WAY MATCH</span>`;
                else statusMarkup = `<span class="badge badge-pill badge-success"><i class="fas fa-lock mr-1"></i>DIRECT MATCH</span>`;
            }

            let deleteConcernMarkup = '';
            if (hasMatch && isMe) {
                const myRecord = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE) && x.id === row.id);
                const partnerRecord = MASTER_DATA.find(p => p.id === myRecord.MATCH_ID);

                if (myRecord.DELETE_REQUEST === 'REQUESTED') {
                    deleteConcernMarkup = `<div class="badge-pending-approval"><i class="fas fa-hourglass-half mr-2"></i>Request Sent</div>`;
                } else if (partnerRecord && partnerRecord.DELETE_REQUEST === 'REQUESTED') {
                    deleteConcernMarkup = `<button class="btn btn-sm btn-glow-success rounded-pill px-3" onclick="approveDeletion()"><i class="fas fa-check-double mr-1"></i>Approve Request</button>`;
                } else {
                    deleteConcernMarkup = `<button class="btn btn-sm btn-outline-warning rounded-pill px-3" onclick="requestDeletion()"><i class="fas fa-trash-alt mr-1"></i>Request Deletion</button>`;
                }
            } else {
                deleteConcernMarkup = `<span class="text-muted small">N/A</span>`;
            }

            rowsHtml += `<tr class="${isMe ? 'row-identity' : ''}" data-id="${row.id}"><td>${index + 1}</td><td><div class="font-weight-bold text-dark">${row['Your Designation']}</div>${isMe ? '<div class="text-primary font-weight-bold" style="font-size:0.65rem;">MY ENTRY</div>' : ''}</td><td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td><td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${row['Willing District']}</strong></td><td class="d-table-cell"><div class="demand-pill ${demandCfg.c}"><span class="pulse-dot-small" style="background:${demandCfg.d};"></span> ${row.DEMAND_STATUS || 'Moderate'}</div></td><td>${statusMarkup}</td><td class="text-center"><button class="btn btn-unlock shadow-sm ${!hasMatch ? 'opacity-50' : 'btn-hover-grow'}" onclick="unlockRow('${row.id}', ${hasMatch})"><i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock text-white-50'}"></i></button></td><td>${deleteConcernMarkup}</td></tr>`;
        });
        tbody.html(rowsHtml);
    }
}

function renderArchiveTable(archivedRecords) {
    const tbody = $('#archiveTbody').empty();
    const noDataView = $('#noArchiveData');
    noDataView.toggleClass('d-none', archivedRecords.length > 0);

    archivedRecords.forEach((row, index) => {
        tbody.append(`<tr class="align-middle"><td>${index + 1}</td><td class="py-3 px-4"><div class="font-weight-bold text-dark">${row['Your Designation'] || 'Employee'}</div><small class="text-muted"><i class="fas fa-fingerprint mr-1"></i>ID: ${row.id || 'N/A'}</small></td><td class="py-3"><div class="d-flex align-items-center"><div class="text-muted small"><span class="d-block"><i class="fas fa-map-marker-alt mr-1"></i>${row['Working District']}</span><span class="d-block text-primary"><i class="fas fa-arrow-right mr-1"></i>${row['Willing District']}</span></div></div></td><td class="py-3 text-center"><span class="badge badge-pill py-2 px-3" style="background: #ecfdf5; color: #059669; border: 1px solid #10b981;"><i class="fas fa-check-circle mr-1"></i>${row.reason || 'SUCCESS'}</span></td></tr>`);
    });
}

async function unlockRow(id, active) {
    const isActive = String(active) === "true" || active === true;
    if (!isActive) { showToast("Match required to view contact", "info"); return; }
    $("#globalLoader").removeClass("d-none");
    try {
        const res = await fetch(API, { method: "POST", body: JSON.stringify({ action: "getContact", rowId: id, userPhone: MY_PHONE }) });
        const data = await res.json();
        $("#globalLoader").addClass("d-none");

        if (data.error) {
            showToast(data.error, "error");
        } else {
            if (data.is3Way) {
                $('#chainPersonB').text(data.partnerB.name); $('#chainPersonC').text(data.partnerC.name); $('#distB').text(data.partnerB.workingDistrict); $('#distC').text(data.partnerC.workingDistrict); $('#modalChain').modal('show');
            } else {
                $('#resName').text(data.name || "N/A"); $('#resPhone').text(data.contact || "N/A"); $('#callLink').attr("href", "tel:" + data.contact); $('#waLink').attr("href", "https://wa.me/91" + data.contact); $('#modalContact').modal('show');
            }
            showToast("Contact Unlocked!", "success");
        }
    } catch (e) { $("#globalLoader").addClass("d-none"); showToast("Server Error", "error"); }
}

async function executeDeletion() {
    let sel = $('input[name="delReason"]:checked').val();
    if (sel === "Found Match through this site") {
        $('#modalDeleteConfirm').modal('hide');
        $('#modalSuccessConfirm').modal('show');
        return;
    }
    let finalReason = sel === "OTHER" ? $('#deleteReasonOther').val().trim() : sel;
    if (sel === "OTHER" && !finalReason) { alert("Please provide a reason."); return; }
    if (!confirm("Are you sure? This will move your profile to the Archive.")) return;
    finalizeDeletion(finalReason, false);
}

async function finalizeSuccessDeletion() {
    finalizeDeletion("Found Match through this site", true);
}

async function finalizeDeletion(reason, isHubSuccess) {
    $('#modalSuccessConfirm, #modalDeleteConfirm').modal('hide');
    $("#globalLoader").removeClass("d-none");

    try {
        const res = await fetch(API, { method: "POST", body: JSON.stringify({ action: "deleteEntry", userPhone: MY_PHONE, reason: reason, isHubSuccess: isHubSuccess }) });
        const data = await res.json();
        if (data.status === "SUCCESS") {
            alert("Profile archived successfully. Total Leaved count updated.");
            clearIdentity();
            window.location.reload();
        } else {
            alert("Error: " + data.error);
            $("#globalLoader").addClass("d-none");
        }
    } catch (e) { $("#globalLoader").addClass("d-none"); alert("System Sync Error."); }
}

function requestDeletion() {
    $('#modalRequestDelete').modal('show');
}

function approveDeletion() {
    $('#modalApproveDelete').modal('show');
}

async function sendDeleteRequest() {
    $('#modalRequestDelete').modal('hide');
    callApi({ action: "requestDelete" }, "Requesting deletion...", "Deletion request sent successfully.", professionalSync);
}

async function approveMutualDeletion() {
    $('#modalApproveDelete').modal('hide');
    callApi({ action: "approveDelete" }, "Approving deletion...", "Mutual deletion successful. Both profiles removed.", () => setTimeout(() => location.reload(), 500));
}

async function callApi(payload, loadingMsg, successMsg, callback) {
    $("#globalLoader").removeClass("d-none").find('h6').text(loadingMsg);
    try {
        const res = await fetch(API, { method: "POST", body: JSON.stringify({ ...payload, userPhone: MY_PHONE }) });
        const data = await res.json();
        if (data.status === "SUCCESS") {
            showToast(successMsg, "success");
            if (callback) callback();
        } else {
            showToast(data.error || "An unknown error occurred.", "error");
        }
    } catch (e) { 
        showToast("Server communication error.", "error");
    } finally {
        $("#globalLoader").addClass("d-none").find('h6').text("Processing...");
    }
}

function updateGlobalStats(isHubSuccess) { let totalLeaved = parseInt($('#statArchived').text()) || 0; $('#statArchived').text(totalLeaved + 1); if (isHubSuccess) { let hubSuccess = parseInt($('#statMatched').text()) || 0; $('#statMatched').text(hubSuccess + 1); } }

function animateValue(id, start, end, duration) { 
    const obj = document.getElementById(id); 
    if (!obj) return; 
    if (start === end) { 
        obj.innerHTML = end; 
        return; 
    } 
    let startTimestamp = null; 
    const step = (timestamp) => { 
        if (!startTimestamp) startTimestamp = timestamp; 
        const progress = Math.min((timestamp - startTimestamp) / duration, 1); 
        obj.innerHTML = Math.floor(progress * (end - start) + start); 
        if (progress < 1) { 
            window.requestAnimationFrame(step); 
        } 
    }; 
    window.requestAnimationFrame(step); 
}

function showSlimProgress(percent) { if (!$('#slim-progress').length) $('body').append('<div id="slim-progress" style="position:fixed; top:0; left:0; height:3px; background:#4f46e5; z-index:9999; transition: width 0.4s ease;"></div>'); $('#slim-progress').css('width', percent + '%').show(); }
function hideSlimProgress() { $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%')); }
function toggleMatches() { if (!MY_PHONE) { $('#modalVerify').modal('show'); return; } FILTER_MATCHES = !FILTER_MATCHES; const btn = $('#btnMatches'); FILTER_MATCHES ? btn.removeClass('btn-outline-primary').addClass('btn-primary text-white') : btn.addClass('btn-outline-primary').removeClass('btn-primary text-white'); renderTable(); }

function buildFilters() {
    const desigSet = [...new Set(MASTER_DATA.map(x => x['Your Designation']))].filter(Boolean).sort();
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].filter(Boolean).sort();
    const toSet = [...new Set(MASTER_DATA.map(x => x['Willing District']))].filter(Boolean).sort();

    $('#selDesignation').html('<option value="all">All Designations</option>').prop('disabled', false);
    $('#selFrom').html('<option value="all">All Districts</option>').prop('disabled', false);
    $('#selTo').html('<option value="all">All Districts</option>').prop('disabled', false);

    desigSet.forEach(d => $('#selDesignation').append(`<option value="${d}">${d}</option>`));
    fromSet.forEach(d => $('#selFrom').append(`<option value="${d}">${d}</option>`));
    toSet.forEach(d => $('#selTo').append(`<option value="${d}">${d}</option>`));
}

function saveVerify() { const val = $('#verifyPhone').val(); if (!/^\d{10}$/.test(val)) { alert("Invalid phone format."); return; } if (MASTER_DATA.some(x => String(x.phone) === String(val))) { localStorage.setItem("userPhone", val); location.reload(); } else { $('#loginError, #regSection').fadeIn(); } }
function showToast(message, type = 'success') { $('.custom-toast').remove(); const icon = type === 'success' ? 'fa-check-circle' : 'fa-info-circle'; const bgColor = type === 'success' ? '#10b981' : '#4f46e5'; const toast = $(`<div class="custom-toast shadow-lg"><i class="fas ${icon} mr-2"></i><span>${message}</span></div>`); $('body').append(toast); toast.css({ 'position': 'fixed', 'bottom': '20px', 'left': '50%', 'transform': 'translateX(-50%)', 'background': bgColor, 'color': 'white', 'padding': '12px 24px', 'border-radius': '50px', 'z-index': '10000', 'font-weight': '600', 'display': 'none' }); toast.fadeIn(400).delay(3000).fadeOut(400, function() { $(this).remove(); }); }
function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }
function resetUI() { $('#selDesignation').val('all'); $('#selFrom').val('all'); $('#selTo').val('all'); FILTER_MATCHES = false; $('#btnMatches').addClass('btn-outline-primary').removeClass('btn-primary text-white'); renderTable(); }

function deleteMyEntry() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    const myRecords = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    const isMatched = myRecords.some(r => (r.MATCH_STATUS || "").toUpperCase().includes("MATCH"));
    
    if (isMatched) {
        showToast("Please use the 'Delete Concern' column for matched profiles.", "info");
    } else {
        $('#r1-wrapper').hide();
        $('#r2-wrapper').show();
        $('#r2').prop('checked', true);
        $('#r3').prop('checked', false);
        $('#otherReasonWrapper').addClass('d-none');
        $('#modalDeleteConfirm').modal('show');
    }
}

function editProfile() { const userPhone = localStorage.getItem("userPhone"); if (userPhone) { window.location.href = `testreg.html?editPhone=${userPhone}`; } else { alert("Please login first"); } }
function selectRadio(id) { $(`#${id}`).prop('checked', true); if(id === 'r3') $('#otherReasonWrapper').removeClass('d-none'); else $('#otherReasonWrapper').addClass('d-none'); }
function redirectToRegistration() { const up = localStorage.getItem("userPhone"); const url = "https://dhileepank2-web.github.io/mutual-transfer-dash/testreg.html"; window.location.href = up ? `${url}?editPhone=${up}` : url; }
function shareToWhatsApp() { const appUrl = window.location.href.split('?')[0]; const myDistrict = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE))?.['Working District'] || "my district"; const text = `*Mutual Transfer Portal Update* 🌐\n\nI'm looking for a transfer from *${myDistrict}*. \nCheck live matches and register your profile here:\n\n👉 ${appUrl}`; const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`; window.open(waUrl, '_blank'); }
function copyInviteLink() { const appUrl = window.location.href.split('?')[0]; navigator.clipboard.writeText(appUrl).then(() => { showToast("Invite link copied!", "success"); }); }

function renderHubActivity(activities) {
    const container = $('#hubActivityList').empty();
    if (!activities || !activities.length) {
        container.html('<div class="text-center p-4 text-muted border rounded-24">No recent activity.</div>');
        return;
    }

    // Sort by date
    activities.sort((a, b) => {
        const dateA = new Date(a.matchDate || a.time.split(',')[0]);
        const dateB = new Date(b.matchDate || b.time.split(',')[0]);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
    });

    activities.forEach((act, i) => {
        if (typeof act !== 'object' || act === null) return;
        const delay = i * 0.1;

        const date = new Date(act.matchDate || act.time);
        const time = isNaN(date) ? (act.time || 'Recently') : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const msg = act.msg ? act.msg : `✅ A successful transfer was completed for a <strong>${act.designation || 'user'}</strong> from ${act.from || 'a district'} to ${act.to || 'another'}.`;
        const type = act.type || 'MATCH SUCCESS';
        const user = act.user || act.name || 'Verified User';

        const card = `
            <div class="activity-card" style="animation-delay: ${delay}s">
                <div class="activity-header">
                    <div class="activity-title">${type}</div>
                    <div class="activity-time">${time}</div>
                </div>
                <div class="activity-body">${msg}</div>
                <div class="activity-footer">${user}</div>
            </div>
        `;
        container.append(card);
    });
}

function loadMyActivity() {
    const container = $('#myActivityList').empty();
    if (!MY_PHONE) {
        container.html('<div class="text-center p-4 text-muted border rounded-24">Login to see your activity.</div>');
        return;
    }

    fetch(`${API}?action=getUserUpdateHistory&userPhone=${MY_PHONE}`)
    .then(r => r.json())
    .then(activities => {
        if (!activities || !activities.length) {
            container.html('<div class="text-center p-4 text-muted border rounded-24">You have no recent activity.</div>');
            return;
        }

        activities.forEach((act, i) => {
            if (typeof act !== 'object' || act === null) return;
            const delay = i * 0.1;
            const time = act.date || new Date().toLocaleTimeString();
            const msg = act.details || 'An update was posted.';
            const type = act.action || 'PROFILE_UPDATE';

            const card = `
            <div class="activity-card" style="animation-delay: ${delay}s">
                <div class="activity-header">
                    <div class="activity-title">${type}</div>
                    <div class="activity-time">${time}</div>
                </div>
                <div class="activity-body">${msg}</div>
            </div>
        `;

            container.append(card);
        });
    })
    .catch(err => {
        container.html('<div class="text-center p-4 text-danger border rounded-24">Failed to load activity.</div>');
        console.error("My Activity Error:", err);
    });
}

function loadActivityLog() { const container = $('#notificationList').empty(); const audit = $('#auditLog').empty(); const myEntries = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE)); if (myEntries.length === 0) { container.html(`<div class="text-center p-5 border rounded-24 bg-white"><p class="text-muted mb-0">No active registration found.</p></div>`); return; } const successfulMatches = myEntries.filter(e => (e.MATCH_STATUS || '').toUpperCase().includes("MATCH")); if (successfulMatches.length > 0) { successfulMatches.forEach(m => { const is3Way = (m.MATCH_STATUS || '').toUpperCase().includes("3-WAY"); container.append(`<div class="history-card" style="border-left-color: ${is3Way ? '#7c3aed' : '#10b981'};"><div class="d-flex justify-content-between align-items-start"><div><span class="badge ${is3Way ? 'badge-secondary' : 'badge-success'} mb-2">${is3Way ? '3-WAY MATCH' : 'DIRECT MATCH'}</span><h6 class="font-weight-bold mb-1">Transfer to ${m['Willing District']} Ready</h6><p class="small text-muted mb-0">A mutual match has been found for your request.</p></div><button class="btn btn-sm btn-primary rounded-pill px-3" onclick="unlockRow('${m.id}', true)">View Contact</button></div></div>`); }); } myEntries.filter(e => !(e.MATCH_STATUS || '').toUpperCase().includes("MATCH")).forEach(p => { container.append(`<div class="history-card" style="border-left-color: #cbd5e1;"><div class="d-flex align-items-center"><div class="spinner-grow spinner-grow-sm text-muted mr-3" role="status"></div><div><p class="mb-0 font-weight-bold">Searching for ${p['Willing District']}...</p></div></div></div>`); }); audit.html(`<div class="p-3 bg-white border rounded-15 mb-2 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Profile Verified</div><div class="text-muted" style="font-size: 0.75rem;">Identity confirmed via ${MY_PHONE.slice(-4)}</div></div><div class="p-3 bg-white border rounded-15 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Syncing Districts</div><div class="text-muted" style="font-size: 0.75rem;">Tracking ${myEntries.length} location(s)</div></div>`); }

function renderFeedbacks(feedbacks) { 
    const container = $('#feedbackContainer').empty(); 
    if (!feedbacks || !feedbacks.length) { 
        container.html('<div class="col-12 text-center p-5 text-muted">No feedbacks yet. Be the first!</div>'); 
        return; 
    } 
    feedbacks.forEach(f => { 
        container.append(`<div class="col-md-6 mb-3"><div class="bg-white p-3 rounded-24 border shadow-sm h-100"><div class="d-flex align-items-center mb-2"><div class="bg-primary-light text-primary rounded-circle d-flex align-items-center justify-content-center mr-2" style="width:35px; height:35px; font-size:0.8rem; font-weight:bold;">${(f.name || 'U').charAt(0).toUpperCase()}</div><div><div class="font-weight-bold text-dark" style="font-size:0.85rem;">${f.name || 'Anonymous'}</div><small class="text-muted" style="font-size:0.7rem;">ID: ${f.id || 'N/A'}</small></div></div><p class="mb-0 text-muted small" style="font-style: italic;">"${f.comment || f.text || ''}"</p></div></div>`); 
    }); 
}

function submitFeedback() { const feedbackText = document.getElementById('txtFeedback').value; if (!feedbackText.trim()) { alert("Please enter some feedback first."); return; } $('#globalLoader').removeClass('d-none'); setTimeout(() => { const newFeedback = `<div class="col-md-4 mb-3"><div class="card border-0 shadow-sm rounded-24 p-3"><p class="small text-muted mb-0">"${feedbackText}"</p><div class="text-right mt-2"><small class="font-weight-bold text-primary">- You</small></div></div></div>`; $('#feedbackContainer').prepend(newFeedback); document.getElementById('txtFeedback').value = ""; $('#modalFeedback').modal('hide'); $('#globalLoader').addClass('d-none'); alert("Feedback submitted successfully!"); }, 1500); }
