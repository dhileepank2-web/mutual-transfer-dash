const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
const USER_PAGE_SIZE = 50;
let CURRENT_USER_PAGE = 1;
let SEARCH_TERM = '';
let FILTER_MODE = '';
let SEARCH_DEBOUNCE = null;

$(document).ready(() => {
    const userPhone = new URLSearchParams(window.location.search).get('userPhone');
    if (!userPhone) {
        alert("Admin phone number not provided.");
        return;
    }

    loadAdminData(userPhone, CURRENT_USER_PAGE, SEARCH_TERM, FILTER_MODE);

    // Event Listeners
    $('#userSearch').on('keyup', function() {
        clearTimeout(SEARCH_DEBOUNCE);
        SEARCH_DEBOUNCE = setTimeout(() => {
            SEARCH_TERM = $(this).val();
            CURRENT_USER_PAGE = 1;
            loadAdminData(userPhone, CURRENT_USER_PAGE, SEARCH_TERM, FILTER_MODE, true);
        }, 500);
    });

    $('#filterDuplicatesBtn').on('click', function() {
        $(this).toggleClass('active btn-primary').toggleClass('btn-outline-primary');
        FILTER_MODE = $(this).hasClass('active') ? 'duplicates' : '';
        CURRENT_USER_PAGE = 1;
        SEARCH_TERM = '';
        $('#userSearch').val('');
        loadAdminData(userPhone, CURRENT_USER_PAGE, SEARCH_TERM, FILTER_MODE, true);
    });

    $('#confirmRejectDeletionBtn').on('click', confirmDeletionRejection);
    $('#confirmRejectEditBtn').on('click', confirmEditRejection);
    $('#confirmSendMessageBtn').on('click', confirmSendMessage);
});

async function loadAdminData(userPhone, page, searchTerm, filter, usersOnly = false) {
    showLoader(true, usersOnly ? 'Updating user list...' : 'Loading dashboard...');
    try {
        const url = `${API}?action=getAdminDashboardData&userPhone=${userPhone}&page=${page}&pageSize=${USER_PAGE_SIZE}&searchTerm=${encodeURIComponent(searchTerm)}&filter=${filter}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server returned an error:", response.status, errorText);
            throw new Error(`Server error: ${response.status}. See console for full response.`);
        }

        const data = await response.json();

        if (data.error) throw new Error(data.error);

        const users = data.allUsers || [];
        const paginationData = data.pagination || {};
        const editRequests = data.editRequests || [];
        const deleteRequests = data.deleteRequests || [];

        renderAllUsers(users, filter === 'duplicates', page);
        renderUsersPagination(paginationData);

        if (!usersOnly) {
            updateRequestCount('#editRequestsCount', editRequests.length);
            renderEditRequests(editRequests);
            updateRequestCount('#deleteRequestsCount', deleteRequests.length);
            renderDeleteRequests(deleteRequests);
        }
    } catch (err) {
        console.error("Failed to load admin data:", err);
        const errorMessage = err.message.includes('JSON') 
            ? "The backend script returned an invalid response (not JSON), which likely means it timed out or encountered a critical error. Check the developer console for the server's output."
            : err.message;
        alert(`Error loading admin data: ${errorMessage}`);
    } finally {
        showLoader(false);
    }
}

function renderAllUsers(users, isDuplicateView, currentPage) {
    const thead = $('#usersThead').empty();
    const tbody = $('#usersTbody').empty();
    if (!users.length) {
        thead.html('');
        tbody.html(`<tr><td colspan="100%" class="text-center p-5">${isDuplicateView ? 'No duplicates found.' : 'No users match your search.'}</td></tr>`);
        return;
    }

    const headers = ['S.No.', ...Object.keys(users[0])];
    thead.html(`<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`);

    const startSerial = (currentPage - 1) * USER_PAGE_SIZE;

    if (isDuplicateView) {
        const usersByPhone = users.reduce((acc, user, index) => {
            const phone = user['Contact No'];
            if (!acc[phone]) {
                acc[phone] = { users: [], originalIndex: index };
            }
            acc[phone].users.push(user);
            return acc;
        }, {});

        const colorPalette = ['#E8F0FE', '#FCE8E6', '#E6F4EA', '#FEF7E0', '#F3E8FD', '#FFF0E1', '#E0F7FA'];
        let colorIndex = 0;

        Object.keys(usersByPhone).forEach(phone => {
            const userGroup = usersByPhone[phone];
            const groupColor = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;

            userGroup.users.forEach((user, index) => {
                const serialNumber = startSerial + userGroup.originalIndex + index + 1;
                let rowHtml = `<td>${serialNumber}</td>`;
                rowHtml += Object.keys(users[0]).map(header => `<td>${user[header] || ''}</td>`).join('');
                tbody.append(`<tr style="background-color: ${groupColor}">${rowHtml}</tr>`);
            });

            const totalColumns = headers.length;
            const mergeRowHtml = `
                <tr class="merge-row" style="background-color: ${groupColor};">
                    <td colspan="${totalColumns}" class="text-right py-2 px-3">
                        <button class="btn btn-primary btn-sm font-weight-bold" onclick="mergeDuplicates('${phone}')">
                            <i class="fas fa-compress-arrows-alt mr-2"></i>Merge ${userGroup.users.length} Entries for ${phone}
                        </button>
                    </td>
                </tr>
            `;
            tbody.append(mergeRowHtml);
            tbody.append(`<tr><td colspan="${totalColumns}" style="height: 15px; background-color: #f8f9fa; border: none;"></td></tr>`);
        });

    } else {
        users.forEach((user, index) => {
            let rowHtml = `<td>${startSerial + index + 1}</td>`;
            rowHtml += Object.keys(user).map(header => `<td>${user[header] || ''}</td>`).join('');
            tbody.append(`<tr>${rowHtml}</tr>`);
        });
    }
}

function renderUsersPagination(pagination) {
    const { currentPage, totalPages, totalUsers } = pagination;
    const container = $('#usersPaginationContainer').empty();
    const info = $('#usersPaginationInfo').empty();

    if (!totalUsers || totalUsers === 0) return;

    const startUser = (currentPage - 1) * USER_PAGE_SIZE + 1;
    const endUser = Math.min(currentPage * USER_PAGE_SIZE, totalUsers);
    info.text(`Showing ${startUser}-${endUser} of ${totalUsers} users`);

    if (totalPages <= 1) return;

    let html = '<ul class="pagination">';
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changeUserPage(${currentPage - 1})">«</a></li>`;

    let startPage, endPage;
    if (totalPages <= 5) { startPage = 1; endPage = totalPages; } 
    else { 
        if (currentPage <= 3) { startPage = 1; endPage = 5; } 
        else if (currentPage + 1 >= totalPages) { startPage = totalPages - 4; endPage = totalPages; } 
        else { startPage = currentPage - 2; endPage = currentPage + 2; }
    }

    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="changeUserPage(1)">1</a></li>`;
        if (startPage > 2) { html += `<li class="page-item disabled"><span class="page-link">...</span></li>`; }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="changeUserPage(${i})">${i}</a></li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) { html += `<li class="page-item disabled"><span class="page-link">...</span></li>`; }
        html += `<li class="page-item"><a class="page-link" href="#" onclick="changeUserPage(${totalPages})">${totalPages}</a></li>`;
    }

    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changeUserPage(${currentPage + 1})">»</a></li>`;
    html += '</ul>';
    container.html(html);
}

function changeUserPage(page) {
    event.preventDefault();
    const userPhone = new URLSearchParams(window.location.search).get('userPhone');
    const totalPages = parseInt($('#usersPaginationContainer .page-item:last-child').prev().text()) || 1;
    if (page < 1 || page > totalPages) return;
    CURRENT_USER_PAGE = page;
    loadAdminData(userPhone, CURRENT_USER_PAGE, SEARCH_TERM, FILTER_MODE, true);
}

function renderEditRequests(requests) {
    const container = $('#editRequestsContainer').empty();
    if (!requests.length) {
        container.html('<div class="col-12"><div class="alert alert-info">No pending edit requests.</div></div>');
        return;
    }
    requests.forEach(req => {
        let oldDataHtml;
        let isBackendError = false;

        if (typeof req.currentUserData === 'object' && req.currentUserData !== null && req.currentUserData.error) {
            isBackendError = true;
            oldDataHtml = `<div class="alert alert-danger small p-2"><strong>Backend Error:</strong> ${req.currentUserData.error}<br><small>The backend script failed to fetch the original data, likely due to a data type bug. You can try to force the approval, but it may fail.</small></div>`;
        } else {
            oldDataHtml = `<pre class="small">${JSON.stringify(req.currentUserData, null, 2)}</pre>`;
        }

        const approveButton = isBackendError 
            ? `<button class="btn btn-warning btn-sm" onclick="approveWithWarning('${req.requestId}')">Force Approve</button>`
            : `<button class="btn btn-success btn-sm" onclick="approveEdit('${req.requestId}')">Approve</button>`;

        const rejectButton = `<button class="btn btn-danger btn-sm" onclick="openRejectEditModal('${req.requestId}')">Reject</button>`;

        container.append(`
            <div class="col-md-6 mb-4">
                <div class="card request-card h-100">
                    <div class="card-header font-weight-bold">${req.newData.name} (${req.phone})</div>
                    <div class="card-body">
                        <p><strong>Reason:</strong> ${req.reason}</p>
                        <div class="row">
                            <div class="col-6">
                                <h6 class="text-muted">Old</h6>
                                ${oldDataHtml}
                            </div>
                            <div class="col-6">
                                <h6 class="text-success">New</h6>
                                <pre class="small">${JSON.stringify(req.newData, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-white text-right">
                        ${approveButton} 
                        ${rejectButton}
                    </div>
                </div>
            </div>`);
    });
}

function renderDeleteRequests(requests) {
    const container = $('#deleteRequestsContainer').empty();
    if (!requests.length) {
        container.html('<div class="col-12"><div class="alert alert-info">No pending delete requests.</div></div>');
        return;
    }
    requests.forEach(req => {
        const partnerInfo = req.partners.map(p => `<li class="list-group-item d-flex justify-content-between align-items-center py-2"><small>${p.name} (${p.phone})</small><span class="badge ${p.deleteRequestStatus === 'REQUESTED' ? 'badge-warning' : 'badge-secondary'}">${p.deleteRequestStatus}</span></li>`).join('');
        container.append(`<div class="col-md-6 mb-4"><div class="card request-card h-100"><div class="card-header font-weight-bold d-flex justify-content-between"><span>${req.requestingUser.name} (${req.requestingUser.phone})</span><span class="badge ${req.isMatched ? 'badge-primary' : 'badge-light'}">${req.isMatched ? 'Matched' : 'Unmatched'}</span></div><div class="card-body">${req.isMatched ? `<h6 class="card-subtitle mb-2 text-muted small">Partners:</h6><ul class="list-group list-group-flush mb-3">${partnerInfo}</ul>` : ''}</div><div class="card-footer bg-white text-right"><button class="btn btn-info btn-sm" onclick="openMessageModal('${req.requestingUser.phone}')">Message</button><button class="btn btn-success btn-sm" onclick="approveDeletion('${req.requestingUser.phone}')">Approve</button><button class="btn btn-danger btn-sm" onclick="openRejectDeleteModal('${req.requestingUser.phone}')">Reject</button></div></div></div>`);
    });
}

function approveWithWarning(requestId) {
    if (confirm("Warning: The backend failed to load original data due to a bug. Forcing the approval might still fail. Do you want to proceed?")) {
        approveEdit(requestId);
    }
}

async function approveEdit(requestId) { await adminAction('approveEditRequest', { requestId }, 'Approving edit...'); }
async function approveDeletion(userPhone) { await adminAction('approveDeleteRequestAdmin', { requestingUserPhone: userPhone }, 'Approving deletion...'); }
async function mergeDuplicates(phone) {
    if (confirm(`Are you sure you want to merge all entries for ${phone}? This will combine their willing districts and delete the old records. This cannot be undone.`)) {
        await adminAction('mergeDuplicates', { phoneToMerge: phone }, 'Merging entries...');
    }
}

function openRejectEditModal(requestId) { $('#rejectEditRequestId').val(requestId); $('#modalRejectEdit').modal('show'); }
function openRejectDeleteModal(userPhone) { $('#rejectDeleteUserPhone').val(userPhone); $('#modalRejectDeletion').modal('show'); }
function openMessageModal(userPhone) { $('#messageUserPhone').val(userPhone); $('#messageText').val(''); $('#modalSendMessage').modal('show'); }

async function confirmEditRejection() {
    const requestId = $('#rejectEditRequestId').val();
    const reason = $('#rejectionEditReason').val();
    if (!reason) { alert('Rejection reason is required.'); return; }
    $('#modalRejectEdit').modal('hide');
    await adminAction('rejectEditRequest', { requestId, reason }, 'Rejecting edit...');
}

async function confirmDeletionRejection() {
    const userPhone = $('#rejectDeleteUserPhone').val();
    const reason = $('#rejectionDeleteReason').val();
    if (!reason) { alert('Rejection reason is required.'); return; }
    $('#modalRejectDeletion').modal('hide');
    await adminAction('rejectDeleteRequestAdmin', { requestingUserPhone: userPhone, reason: reason }, 'Rejecting deletion...');
}

async function confirmSendMessage() {
    const userPhone = $('#messageUserPhone').val();
    const message = $('#messageText').val();
    if (!message) { alert('Message cannot be empty.'); return; }
    $('#modalSendMessage').modal('hide');
    await adminAction('adminSendNotification', { targetUserPhone: userPhone, messageText: message }, 'Sending message...');
}

async function adminAction(action, payload, loadingMsg) {
    showLoader(true, loadingMsg);
    try {
        const postData = {
            action: action,
            userPhone: new URLSearchParams(window.location.search).get('userPhone'),
            ...payload
        };

        const response = await fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }

        alert(`Action '${action}' was sent to the server. Reloading the dashboard to see changes.`);
        
        const userPhone = new URLSearchParams(window.location.search).get('userPhone');
        loadAdminData(userPhone, CURRENT_USER_PAGE, SEARCH_TERM, FILTER_MODE, false);

    } catch (err) {
        alert(`Action failed: ${err.message}. Please check your connection and the developer console for more details.`);
        console.error("Full error details from adminAction:", err);
        showLoader(false);
    }
}

function showLoader(show, msg = 'Processing...') {
    const loader = $('#globalLoader');
    if (show) {
        loader.find('h6').text(msg);
        loader.removeClass('d-none');
    } else {
        loader.addClass('d-none');
    }
}

function updateRequestCount(elementId, count) {
    const badge = $(elementId);
    if (count > 0) {
        badge.text(count).removeClass('d-none');
    } else {
        badge.addClass('d-none');
    }
}
