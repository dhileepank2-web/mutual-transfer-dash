const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0;
let MY_PHONE = localStorage.getItem("userPhone");

$(document).ready(() => {
    loadData();
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);
});

async function loadData() {
    showSkeleton();
    $("#globalLoader").show();
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const response = await r.json();
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;

        if (response.publicHubActivity) renderHubActivity(response.publicHubActivity);
        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        setupAuth();
        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        buildFilters();
        renderTable();
        $("#globalLoader").fadeOut();
    } catch (err) {
        $("#globalLoader").hide();
        console.error(err);
    }
}

function setupAuth() {
    if (MY_PHONE) {
        const userExists = MASTER_DATA.some(x => String(x.phone) === String(MY_PHONE));
        if (userExists) {
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
}

function renderTable() {
    const query = $('#inpSearch').val().toLowerCase();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();
    
    // Potential Match Logic
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
        return myCriteria.some(me => (theirWorking === me.willing && theirWilling === me.working));
    });

    $('#btnMatches').find('.badge').remove();
    if(potentialMatches.length > 0) $('#btnMatches').append(`<span class="badge badge-light ml-1">${potentialMatches.length}</span>`);

    const filtered = MASTER_DATA.filter(r => {
        const matchesSearch = !query || r['Your Designation']?.toLowerCase().includes(query);
        const matchesFrom = !from || from === 'all' || r['Working District'] === from;
        const matchesTo = !to || to === 'all' || r['Willing District'] === to;
        
        if (FILTER_MATCHES) {
            return (potentialMatches.some(m => m.id === r.id) || String(r.phone) === String(MY_PHONE)) && matchesSearch && matchesFrom && matchesTo;
        }
        return matchesSearch && matchesFrom && matchesTo;
    });

    renderTableToDOM(filtered);
}

function renderTableToDOM(data) {
    const tbody = $('#mainTbody').empty();
    $('#noData').toggleClass('d-none', data.length > 0);

    data.forEach(row => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const hasMatch = row.MATCH_STATUS.toUpperCase().includes("MATCH");
        const intensity = getMatchIntensity(row);
        const trust = getTrustScore(row.id);

        tbody.append(`
            <tr class="${isMe ? 'row-identity' : ''} ${hasMatch ? 'matched-glow' : ''}">
                <td>
                    <div class="font-weight-bold">${row['Your Designation']} ${isMe ? '<span class="badge badge-primary">YOU</span>' : ''}</div>
                    <div class="small text-muted"><i class="fas ${trust.icon} text-primary"></i> ${trust.label}</div>
                </td>
                <td>${row['Working District']}</td>
                <td><strong>${row['Willing District']}</strong></td>
                <td class="desktop-only">
                    <div class="d-flex align-items-center">
                        <div class="intensity-ring mr-2" style="border-color: ${intensity.color}">${intensity.percent}%</div>
                    </div>
                </td>
                <td><span class="badge badge-pill ${hasMatch ? 'badge-success' : 'badge-light'}">${row.MATCH_STATUS}</span></td>
                <td class="text-center">
                    <button class="btn btn-unlock" onclick="unlockRow(${row.id}, ${hasMatch})">
                        <i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock'}"></i>
                    </button>
                </td>
            </tr>
        `);
    });
}

// Helpers
function getTrustScore(id) { return id % 2 === 0 ? {label:'Verified', icon:'fa-check-circle'} : {label:'Active', icon:'fa-user-check'}; }
function getMatchIntensity(r) { 
    if(r.MATCH_STATUS.includes("MATCH")) return {percent:100, color:'#10b981'};
    return r.DEMAND_STATUS?.includes("HIGH") ? {percent:65, color:'#3b82f6'} : {percent:30, color:'#94a3b8'};
}

async function unlockRow(id, active) {
    if(!active) { alert("Match required to view contact."); return; }
    $("#globalLoader").fadeIn();
    const res = await fetch(API, { method: "POST", body: JSON.stringify({ action: "getContact", rowId: id, userPhone: MY_PHONE }) });
    const data = await res.json();
    $("#globalLoader").fadeOut();
    if(data.contact) {
        $('#resName').text(data.name); $('#resPhone').text(data.contact);
        $('#callLink').attr("href", "tel:"+data.contact);
        $('#waLink').attr("href", "https://wa.me/91"+data.contact);
        $('#modalContact').modal('show');
    }
}

function updateStats(data, archived) {
    const total = [...new Set(data.map(x => x.phone))].length;
    const matched = data.filter(r => r.MATCH_STATUS.includes("MATCH")).length + archived;
    $('#statTotal').text(total); $('#statMatched').text(matched);
    $('#statRate').text(Math.round((matched/(total||1))*100) + '%');
}

function buildFilters() {
    const f = [...new Set(MASTER_DATA.map(x => x['Working District']))].sort();
    const t = [...new Set(MASTER_DATA.map(x => x['Willing District']))].sort();
    $('#selFrom').html('<option value="all">All Districts</option>').append(f.map(d => `<option value="${d}">${d}</option>`));
    $('#selTo').html('<option value="all">All Districts</option>').append(t.map(d => `<option value="${d}">${d}</option>`));
}

function toggleMatches() { FILTER_MATCHES = !FILTER_MATCHES; renderTable(); }
function saveVerify() {
    const v = $('#verifyPhone').val();
    if(MASTER_DATA.some(x => String(x.phone) === v)) { localStorage.setItem("userPhone", v); location.reload(); }
    else { $('#loginError, #regSection').show(); }
}
function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }
function resetUI() { $('#inpSearch').val(''); $('#selFrom, #selTo').val('all'); FILTER_MATCHES = false; renderTable(); }

function showSkeleton() {
    let s = ""; for(let i=0; i<5; i++) s += `<tr><td colspan="6"><div class="skeleton"></div></td></tr>`;
    $('#mainTbody').html(s);
}
