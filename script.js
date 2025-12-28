const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0;
let MY_PHONE = localStorage.getItem("userPhone");

$(document).ready(() => {
    loadData();

    // Auto-refresh Hub and Stats every 2 minutes
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);
});

// 1. Better State Management
let IS_SYNCING = false;

// 2. High-End Sync Function
async function professionalSync() {
    if (IS_SYNCING || document.visibilityState !== 'visible') return;
    
    IS_SYNCING = true;
    showSlimProgress(30); // Start a subtle top-bar loader

    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();
        
        // Update stats with a counter animation (Pro feature)
        animateValue("statTotal", MASTER_DATA.length, res.records.length, 1000);
        
        // Perform the "Deep Compare" 
        const hasChanges = JSON.stringify(MASTER_DATA) !== JSON.stringify(res.records);
        
        if (hasChanges) {
            MASTER_DATA = res.records;
            renderTable(); // This now needs to handle transitions
            if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
            console.log("Sync Complete: Data Updated");
        }

        showSlimProgress(100);
    } catch (e) {
        console.warn("Background sync failed silently to keep UI smooth.");
    } finally {
        setTimeout(() => { IS_SYNCING = false; hideSlimProgress(); }, 1000);
    }
}

// 3. Subtle Progress Bar UI
function showSlimProgress(percent) {
    if (!$('#slim-progress').length) {
        $('body').append('<div id="slim-progress" style="position:fixed; top:0; left:0; height:3px; background:#4f46e5; z-index:9999; transition: width 0.4s ease;"></div>');
    }
    $('#slim-progress').css('width', percent + '%').fadeIn();
}

function hideSlimProgress() {
    $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%'));
}

// 4. Smooth Counter Animation for Stats
function animateValue(id, start, end, duration) {
    if (start === end) return;
    const obj = document.getElementById(id);
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

// 5. Initialize the Auto-Sync (Every 30 seconds for "Live" feel)
setInterval(professionalSync, 30000);


function loadData() {
    $("#globalLoader").show();
    fetch(`${API}?action=getDashboardData&t=${Date.now()}`)
    .then(r => r.json())
    .then(response => {
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        
        if (response.publicHubActivity) {
            renderHubActivity(response.publicHubActivity);
        }

        const userLookup = MASTER_DATA.reduce((acc, user) => {
            acc[String(user.phone)] = user;
            return acc;
        }, {});

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        if (MY_PHONE) {
            const currentUser = userLookup[String(MY_PHONE)];
            if (currentUser) {
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
        loadActivityLog(); 
        $("#globalLoader").fadeOut();
    })
    .catch(err => {
        console.error("Critical Load Error:", err);
        $("#globalLoader").hide();
        alert("Unable to load data. Please check your internet connection.");
    });
}

function renderHubActivity(activities) {
    const container = $('#hubActivityList').empty();
    if (!activities.length) {
        container.append('<div class="text-center p-4 text-muted border rounded-24">No recent activity.</div>');
        return;
    }
    activities.forEach((act, i) => {
        const delay = i * 0.1; 
        container.append(`
            <div class="activity-item shadow-sm" style="animation-delay: ${delay}s">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="live-indicator"><span class="pulse-dot mr-1" style="width:6px; height:6px;"></span>Live</span>
                    <small class="text-muted" style="font-size:0.7rem;">${act.time}</small>
                </div>
                <div class="font-weight-bold text-dark" style="font-size:0.9rem;">${act.msg}</div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <small class="text-primary font-weight-bold" style="font-size:0.7rem;">${act.type}</small>
                    <small class="text-muted" style="font-size:0.7rem;"><i class="fas fa-user-shield mr-1"></i>${act.user}</small>
                </div>
            </div>
        `);
    });
}

async function syncLiveFeed() {
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();

        // 1. Detect New Matches for the User
        const oldMatches = MASTER_DATA.filter(x => 
            String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")
        ).length;

        const newMatches = res.records.filter(x => 
            String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")
        ).length;

        // 2. Alert user if a match was just found by the system
        if (newMatches > oldMatches) {
            showToast("🎉 Great news! A new mutual match has been found!", "success");
            if (window.navigator.vibrate) window.navigator.vibrate(200); // Haptic feedback
        }

        // 3. Update the UI silently
        MASTER_DATA = res.records;
        renderTable(); 
        updateStats(res.records, res.archivedCount);
        if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
        
    } catch (e) { 
        console.warn("Silent sync failed."); 
    }
}

function updateStats(data, archived) {
    const liveTotal = [...new Set(data.map(x => x.phone))].length;
    const liveMatched = data.filter(r => r.MATCH_STATUS.toUpperCase().includes("MATCH")).length;
    const systemMatchesTotal = liveMatched + archived;
    const totalHistoricalProfiles = liveTotal + archived;
    const rate = totalHistoricalProfiles > 0 ? Math.round((systemMatchesTotal / totalHistoricalProfiles) * 100) : 0;
    
    $('#statTotal').text(liveTotal);
    $('#statMatched').text(systemMatchesTotal);
    $('#statRate').text(rate + '%');
}

function loadActivityLog() {
    const container = $('#notificationList').empty();
    const audit = $('#auditLog').empty();
    const myEntries = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    
    if (myEntries.length === 0) {
        container.append(`<div class="text-center p-5 border rounded-24 bg-white"><p class="text-muted mb-0">No active registration found.</p></div>`);
        return;
    }

    const successfulMatches = myEntries.filter(e => e.MATCH_STATUS.toUpperCase().includes("MATCH"));
    if (successfulMatches.length > 0) {
        successfulMatches.forEach(m => {
            const is3Way = m.MATCH_STATUS.toUpperCase().includes("3-WAY");
            container.append(`
                <div class="history-card" style="border-left-color: ${is3Way ? '#7c3aed' : '#10b981'};">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <span class="badge ${is3Way ? 'badge-secondary' : 'badge-success'} mb-2">${is3Way ? '3-WAY MATCH' : 'DIRECT MATCH'}</span>
                            <h6 class="font-weight-bold mb-1">Transfer to ${m['Willing District']} Ready</h6>
                            <p class="small text-muted mb-0">A mutual match has been found for your request.</p>
                        </div>
                        <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="unlockRow('${m.id}', true)">View Contact</button>
                    </div>
                </div>`);
        });
    }

    myEntries.filter(e => !e.MATCH_STATUS.toUpperCase().includes("MATCH")).forEach(p => {
        container.append(`
            <div class="history-card" style="border-left-color: #cbd5e1;">
                <div class="d-flex align-items-center">
                    <div class="spinner-grow spinner-grow-sm text-muted mr-3" role="status"></div>
                    <div>
                        <p class="mb-0 font-weight-bold">Searching for ${p['Willing District']}...</p>
                    </div>
                </div>
            </div>`);
    });

    audit.append(`
        <div class="p-3 bg-white border rounded-15 mb-2 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Profile Verified</div><div class="text-muted" style="font-size: 0.75rem;">Identity confirmed via ${MY_PHONE.slice(-4)}</div></div>
        <div class="p-3 bg-white border rounded-15 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Syncing Districts</div><div class="text-muted" style="font-size: 0.75rem;">Tracking ${myEntries.length} location(s)</div></div>`);
}

function renderTable() {
    const query = $('#inpSearch').val().toLowerCase();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();
    
    const myCriteria = MASTER_DATA
        .filter(x => String(x.phone) === String(MY_PHONE))
        .map(me => ({
            working: String(me['Working District']).trim().toUpperCase(),
            willing: String(me['Willing District']).trim().toUpperCase()
        }));

    const potentialMatches = MASTER_DATA.filter(r => {
        if (String(r.phone) === String(MY_PHONE)) return false;
        const theirWorking = String(r['Working District']).trim().toUpperCase();
        const theirWilling = String(r['Willing District']).trim().toUpperCase();
        const systemMatch = r.MATCH_STATUS.toUpperCase().includes("MATCH");
        return myCriteria.some(me => {
            const isDirectMutual = (theirWorking === me.willing && theirWilling === me.working);
            const isChainMatch = (systemMatch && theirWorking === me.willing);
            return isDirectMutual || isChainMatch;
        });
    });

    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i> Potential Matches ${potentialMatches.length > 0 ? `<span class="badge badge-light ml-1">${potentialMatches.length}</span>` : ''}`);

    const filtered = MASTER_DATA.filter(r => {
        const isOwn = String(r.phone) === String(MY_PHONE);
        const matchesSearch = !query || r['Your Designation']?.toLowerCase().includes(query);
        const matchesFrom = from === 'all' || r['Working District'] === from;
        const matchesTo = to === 'all' || r['Willing District'] === to;
        if (FILTER_MATCHES) {
            const isMatchForMe = potentialMatches.some(m => m.id === r.id);
            return (isMatchForMe || isOwn) && matchesSearch && matchesFrom && matchesTo;
        }
        return matchesSearch && matchesFrom && matchesTo;
    });
    renderTableToDOM(filtered);
}

function renderTableToDOM(data) {
    const tbody = $('#mainTbody');
    
    // Capture existing IDs before clearing to detect "New" entries
    const existingIds = [];
    tbody.find('tr').each(function() {
        const id = $(this).attr('data-id');
        if (id) existingIds.push(String(id));
    });

    tbody.empty();
    $('#noData').toggleClass('d-none', data.length > 0);
    
    let rowsHtml = ""; 
    data.forEach(row => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const matchStat = (row.MATCH_STATUS || "").toUpperCase();
        const hasMatch = matchStat.includes("MATCH");
        
        // Check if this is a fresh update/new entry
        const isNew = existingIds.length > 0 && !existingIds.includes(String(row.id));
        
        // Demand Styling
        let demandCfg = { c: 'lvl-mod', d: '#f59e0b' }; 
        const dStatus = (row.DEMAND_STATUS || '').toUpperCase();
        if(dStatus.includes('HIGH')) demandCfg = { c: 'lvl-high', d: '#ef4444' };
        if(dStatus.includes('LOW')) demandCfg = { c: 'lvl-low', d: '#10b981' };

        // Status Badges
        let statusMarkup = `<span class="badge badge-pill badge-light text-muted border">PENDING</span>`;
        if(matchStat.includes("3-WAY")) {
            statusMarkup = `<span class="badge badge-pill badge-secondary badge-glow-purple">3-WAY MATCH</span>`;
        } else if(hasMatch) {
            statusMarkup = `<span class="badge badge-pill badge-success badge-glow-green">DIRECT MATCH</span>`;
        }

        rowsHtml += `
            <tr class="${isMe ? 'row-identity' : ''} ${isNew ? 'row-updated' : ''}" data-id="${row.id}">
                <td>
                    <div class="font-weight-bold text-dark">${row['Your Designation']}</div>
                    ${isMe ? '<div class="text-primary font-weight-bold" style="font-size:0.65rem; letter-spacing:0.5px;">MY ENTRY</div>' : ''}
                </td>
                <td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td>
                <td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${row['Willing District']}</strong></td>
                <td class="desktop-only">
                    <div class="demand-pill ${demandCfg.c}">
                        <span class="pulse-dot-small" style="background:${demandCfg.d};"></span>
                        ${row.DEMAND_STATUS || 'Moderate'}
                    </div>
                </td>
                <td>${statusMarkup}</td>
                <td class="text-center">
                    <button class="btn btn-unlock shadow-sm ${!hasMatch ? 'opacity-50' : 'btn-hover-grow'}" 
                            onclick="unlockRow('${row.id}', ${hasMatch})">
                        <i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock text-white-50'}"></i>
                    </button>
                </td>
            </tr>`;
    });
    tbody.html(rowsHtml);
}

async function unlockRow(id, active) {
    const isActive = String(active) === "true" || active === true;
    if(!isActive) { showToast("Match required to view contact", "info"); return; }
    
    $("#globalLoader").fadeIn();
    
    try {
        const res = await fetch(API, {
            method: "POST",
            body: JSON.stringify({ action: "getContact", rowId: id, userPhone: MY_PHONE })
        });
        const data = await res.json();
        $("#globalLoader").fadeOut();

        if(data.error) {
            showToast(data.error, "error");
        } else {
            // Check if it's a 3-way chain or a direct match
            if (data.is3Way) {
                // Populate Chain Modal
                $('#chainPersonB').text(data.partnerB.name);
                $('#chainPersonC').text(data.partnerC.name);
                $('#distB').text(data.partnerB.workingDistrict);
                $('#distC').text(data.partnerC.workingDistrict);
                
                // Set Chat Buttons for the Room
                const roomId = `MATCH_${id}`;
                $('#btnChatPartners').attr('onclick', `openChat('${roomId}', 'Chain Discussion')`);
                
                // OPEN THE CHAIN MODAL
                $('#modalChain').modal('show'); 
            } else {
                // Populate Standard Contact Modal
                $('#resName').text(data.name || "N/A");
                $('#resPhone').text(data.contact || "N/A");
                $('#callLink').attr("href", "tel:" + data.contact);
                $('#waLink').attr("href", "https://wa.me/91" + data.contact);
                
                // Set Private Chat Button
                $('#btnChatPartner').attr('onclick', `openChat('MATCH_${id}', 'Chat with ${data.name}')`);

                // OPEN THE CONTACT MODAL
                $('#modalContact').modal('show'); 
            }
            showToast("Contact Unlocked!", "success");
        }
    } catch(e) { 
        $("#globalLoader").fadeOut(); 
        showToast("Server Error", "error"); 
    }
}

function toggleMatches() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    FILTER_MATCHES = !FILTER_MATCHES;
    const btn = $('#btnMatches');
    FILTER_MATCHES ? btn.removeClass('btn-outline-primary').addClass('btn-primary text-white') : btn.addClass('btn-outline-primary').removeClass('btn-primary text-white');
    renderTable();
}

function deleteMyEntry() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    $('#r1').prop('checked', true);
    $('#otherReasonWrapper').addClass('d-none');
    $('#modalDeleteConfirm').modal('show');
}

async function executeDeletion() {
    let sel = $('input[name="delReason"]:checked').val();
    let finalReason = sel === "OTHER" ? $('#deleteReasonOther').val().trim() : sel;
    if (sel === "OTHER" && !finalReason) { alert("Please provide a reason."); return; }
    if (!confirm("Are you sure? This will permanently remove your profile.")) return;
    $('#modalDeleteConfirm').modal('hide');
    $("#globalLoader").show();
    try {
        const res = await fetch(API, {
            method: "POST",
            body: JSON.stringify({ action: "deleteEntry", userPhone: MY_PHONE, reason: finalReason })
        });
        const data = await res.json();
        if (data.status === "SUCCESS") {
            alert("Entry Successfully Deleted.");
            clearIdentity();
        } else {
            alert("Error: " + data.error);
            $("#globalLoader").fadeOut();
        }
    } catch(e) { $("#globalLoader").fadeOut(); alert("Connection Error."); }
}

function buildFilters() {
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].sort();
    const toSet = [...new Set(MASTER_DATA.map(x => x['Willing District']))].sort();
    $('#selFrom').html('<option value="all">All Districts</option>');
    $('#selTo').html('<option value="all">All Districts</option>');
    fromSet.forEach(d => $('#selFrom').append(`<option value="${d}">${d}</option>`));
    toSet.forEach(d => $('#selTo').append(`<option value="${d}">${d}</option>`));
}

function resetUI() {
    $('#inpSearch').val(''); $('#selFrom').val('all'); $('#selTo').val('all');
    FILTER_MATCHES = false; renderTable();
}

function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }

function redirectToRegistration() {
    const up = localStorage.getItem("userPhone");
    const url = "https://dhileepank2-web.github.io/mutual-transfer-dash/testreg.html";
    window.location.href = up ? `${url}?editPhone=${up}` : url;
}

function saveVerify() {
    const val = $('#verifyPhone').val();
    if(!/^\d{10}$/.test(val)) { alert("Invalid phone format."); return; }
    if(MASTER_DATA.some(x => String(x.phone) === String(val))) {
        localStorage.setItem("userPhone", val);
        location.reload();
    } else {
        $('#loginError, #regSection').fadeIn();
    }
}

// Utility for custom radio select
function selectRadio(id) {
    $(`#${id}`).prop('checked', true);
    if(id === 'r3') $('#otherReasonWrapper').removeClass('d-none');
    else $('#otherReasonWrapper').addClass('d-none');
}
function showToast(message, type = 'success') {
    // Remove existing toast if any
    $('.custom-toast').remove();

    const icon = type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
    const bgColor = type === 'success' ? '#10b981' : '#4f46e5';

    const toast = $(`
        <div class="custom-toast shadow-lg">
            <i class="fas ${icon} mr-2"></i>
            <span>${message}</span>
        </div>
    `);

    $('body').append(toast);
    toast.css({
        'position': 'fixed',
        'bottom': '20px',
        'left': '50%',
        'transform': 'translateX(-50%)',
        'background': bgColor,
        'color': 'white',
        'padding': '12px 24px',
        'border-radius': '50px',
        'z-index': '10000',
        'font-weight': '600',
        'display': 'none'
    });

    toast.fadeIn(400).delay(3000).fadeOut(400, function() { $(this).remove(); });
}
function shareToWhatsApp() {
    const appUrl = window.location.href.split('?')[0]; // Clean URL
    const myDistrict = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE))?.['Working District'] || "my district";
    
    // Professional Message Template
    const text = `*Mutual Transfer Portal Update* 🌐\n\n` +
                 `I'm looking for a transfer from *${myDistrict}*.\n` +
                 `Check live matches and register your profile here:\n\n` +
                 `👉 ${appUrl}\n\n` +
                 `_Verified profiles only. Auto-match system active._`;

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
}
function copyInviteLink() {
    const appUrl = window.location.href.split('?')[0];
    navigator.clipboard.writeText(appUrl).then(() => {
        showToast("Invite link copied to clipboard!", "success");
    }).catch(() => {
        showToast("Failed to copy link", "error");
    });
}
