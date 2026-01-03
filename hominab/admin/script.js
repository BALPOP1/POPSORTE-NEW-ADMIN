let autoRefreshInterval = null;
let dashboardChartInstance = null;

/**
 * DASHBOARD PAGE LOGIC
 */
async function initDashboard() {
    showLoading(true);
    hideError();
    try {
        await Promise.all([
            dataFetcher.fetchData(),
            resultsFetcher.fetchResults(),
            rechargeValidator.fetchRechargeData()
        ]);
        validator.setResults(resultsFetcher.getAllResults());
        updateDashboard();
        updateLastUpdateTime();
        setAccountBanner();
    } catch (error) {
        showError('Failed to load data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function updateDashboard() {
    const entries = dataFetcher.getAllEntries();
    const stats = dataFetcher.getStatistics();
    const winners = validator.getWinners(entries);
    const results = validator.getAllResults();
    const recharges = rechargeValidator.recharges || [];

    setText('totalEntries', stats.totalEntries);
    setText('uniqueContests', stats.uniqueContests);
    setText('uniqueDrawDates', stats.uniqueDrawDates);
    setText('pendingEntries', stats.pendingEntries);
    setText('totalWinners', winners.length);
    setText('winRate', `${stats.totalEntries > 0 ? ((winners.length / stats.totalEntries) * 100).toFixed(2) : '0'}%`);

    renderRechargeAnalytics(recharges, entries);
    renderDailyParticipation(recharges, entries);
    renderContestWinnersBreakdown(entries, results, winners);
    renderDashboardTopPlayers(entries, winners);
    renderRecentEntries(entries);
    
    const metric = document.getElementById('chartMetricSelect')?.value || 'entries';
    renderEntriesVolumeChart(entries, recharges, metric);
}

function renderEntriesVolumeChart(entries, recharges, metric = 'entries') {
    const ctx = document.getElementById('dashboardChart')?.getContext('2d');
    if (!ctx) return;

    const byDate = {};
    const initDate = (d) => {
        if (!byDate[d]) byDate[d] = { entries: 0, rechargers: new Set(), participants: new Set() };
    };

    entries.forEach(e => {
        const key = dateKeyFromString(e.registrationDateTime);
        if (key) {
            initDate(key);
            byDate[key].entries++;
            byDate[key].participants.add(e.gameId);
        }
    });

    recharges.forEach(r => {
        const key = r.rechargeTimeObj ? r.rechargeTimeObj.toISOString().slice(0, 10) : dateKeyFromString(r.rechargeTime);
        if (key) {
            initDate(key);
            byDate[key].rechargers.add(r.gameId);
        }
    });

    const allDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    const last7Dates = allDates.slice(0, 7).reverse();
    
    const getVal = (d) => {
        const data = byDate[d];
        if (metric === 'entries') return data.entries;
        if (metric === 'rechargers') return data.rechargers.size;
        if (metric === 'participants') return data.participants.size;
        if (metric === 'noTicket') {
            let count = 0;
            data.rechargers.forEach(id => { if (!data.participants.has(id)) count++; });
            return count;
        }
        return 0;
    };

    const labels = last7Dates.map(d => d.split('-').slice(1).reverse().join('/'));
    const values = last7Dates.map(getVal);

    if (dashboardChartInstance) {
        dashboardChartInstance.destroy();
    }

    const metricLabels = {
        'entries': 'Total Entries',
        'rechargers': 'Unique Rechargers',
        'participants': 'Unique Participants',
        'noTicket': 'Recharged No Ticket'
    };

    dashboardChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: metricLabels[metric] || 'Stats',
                data: values,
                borderColor: '#4db6ac', // Teal color from image
                backgroundColor: 'rgba(77, 182, 172, 0.1)',
                borderWidth: 5,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#4db6ac',
                pointBorderWidth: 4,
                pointRadius: 8,
                pointHoverRadius: 10,
                tension: 0, // Straight lines like in the image
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 20, right: 20 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(77, 182, 172, 0.9)',
                    titleFont: { family: 'Manrope', size: 13, weight: 'bold' },
                    bodyFont: { family: 'Manrope', size: 12 },
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { 
                        color: 'rgba(0, 0, 0, 0.1)',
                        drawBorder: true,
                        lineWidth: 1
                    },
                    ticks: { 
                        font: { family: 'Manrope', weight: 'bold' }, 
                        color: '#6b7280',
                        stepSize: 10
                    },
                    border: { width: 3, color: '#444' } // Thick axis line
                },
                x: {
                    grid: { 
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: { 
                        font: { family: 'Manrope', weight: 'bold' }, 
                        color: '#6b7280' 
                    },
                    border: { width: 3, color: '#444' } // Thick axis line
                }
            }
        }
    });
}

function renderRechargeAnalytics(recharges, entries) {
    const rechargeUsers = new Set(recharges.map(r => r.gameId));
    const ticketUsers = new Set(entries.map(e => e.gameId));
    const rechargedNoTicket = [...rechargeUsers].filter(id => !ticketUsers.has(id));
    const participated = rechargeUsers.size - rechargedNoTicket.length;
    const rate = rechargeUsers.size > 0 ? ((participated / rechargeUsers.size) * 100).toFixed(1) : '0';

    setText('statRechargers', rechargeUsers.size);
    setText('statParticipants', ticketUsers.size);
    setText('statNoTickets', rechargedNoTicket.length);
    setText('statParticipationRate', `${rate}%`);
    setText('pbRechargers', rechargeUsers.size);
    setText('pbParticipants', ticketUsers.size);
    setText('pbNoTicket', rechargedNoTicket.length);
    setText('pbRate', `${rate}%`);
}

function renderDailyParticipation(recharges, entries) {
    const byDate = {};
    recharges.forEach(r => {
        const key = r.rechargeTimeObj ? r.rechargeTimeObj.toISOString().slice(0, 10) : dateKeyFromString(r.rechargeTime);
        if (key) { if (!byDate[key]) byDate[key] = { rechargers: new Set(), ticketCreators: new Set(), ticketCount: 0 }; byDate[key].rechargers.add(r.gameId); }
    });
    entries.forEach(e => {
        const key = dateKeyFromString(e.registrationDateTime);
        if (key) { if (!byDate[key]) byDate[key] = { rechargers: new Set(), ticketCreators: new Set(), ticketCount: 0 }; byDate[key].ticketCreators.add(e.gameId); byDate[key].ticketCount++; }
    });

    const last7 = Object.keys(byDate).sort((a, b) => b.localeCompare(a)).slice(0, 7);
    const tbody = document.getElementById('dailyParticipationBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    last7.forEach(date => {
        const rec = byDate[date];
        const participation = rec.rechargers.size > 0 ? ((rec.ticketCreators.size / rec.rechargers.size) * 100).toFixed(2) : '—';
        const row = document.createElement('tr');
        row.innerHTML = `<td>${date}</td><td>${rec.rechargers.size}</td><td>${rec.ticketCreators.size}</td><td>${Math.max(rec.rechargers.size - rec.ticketCreators.size, 0)}</td><td>${participation === '—' ? '—' : participation + '%'}</td><td>${participation === '—' ? '—' : (100 - parseFloat(participation)).toFixed(2) + '%'}</td><td>${rec.ticketCount}</td>`;
        tbody.appendChild(row);
    });
}

function renderContestWinnersBreakdown(entries, results, winners) {
    const container = document.getElementById('contestWinnersBreakdown');
    if (!container) return;
    container.innerHTML = '';
    results.forEach(res => {
        const contestEntries = entries.filter(e => e.contest === res.contest && e.drawDate === res.drawDate);
        const contestWinners = winners.filter(w => w.contest === res.contest && w.drawDate === res.drawDate);
        const counts = {1:0,2:0,3:0,4:0,5:0};
        contestWinners.forEach(w => counts[w.validation.matches]++);
        const card = document.createElement('div');
        card.className = 'breakdown-card';
        card.innerHTML = `<div class="breakdown-head"><div><p class="eyebrow">Contest ${res.contest}</p><h3>${res.drawDate}</h3></div><div class="pill">${contestEntries.length} entries</div></div><p class="muted">Winning numbers: ${res.winningNumbers.join(', ')}</p><div class="mini-grid"><div class="mini-stat"><span>5 hits</span><strong>${counts[5]}</strong></div><div class="mini-stat"><span>4 hits</span><strong>${counts[4]}</strong></div><div class="mini-stat"><span>3 hits</span><strong>${counts[3]}</strong></div><div class="mini-stat"><span>2 hits</span><strong>${counts[2]}</strong></div><div class="mini-stat"><span>1 hit</span><strong>${counts[1]}</strong></div></div>`;
        container.appendChild(card);
    });
}

function renderDashboardTopPlayers(entries, winners) {
    const tbody = document.getElementById('topPlayersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const stats = {};
    entries.forEach(e => { const p = e.whatsapp || 'N/A'; if (!stats[p]) stats[p] = { e: 0, w: 0, b: 0 }; stats[p].e++; });
    winners.forEach(w => { const p = w.whatsapp || 'N/A'; if (stats[p]) { stats[p].w++; if (w.validation.matches > stats[p].b) stats[p].b = w.validation.matches; } });
    Object.entries(stats).sort((a, b) => b[1].e - a[1].e).slice(0, 10).forEach(([p, s], idx) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${idx + 1}</td><td>${p}</td><td>${s.e}</td><td>${s.w}</td><td>${s.b > 0 ? s.b + ' hits' : '—'}</td>`;
        tbody.appendChild(row);
    });
}

function renderRecentEntries(entries) {
    const tbody = document.getElementById('recentEntriesBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    entries.slice(0, 12).forEach(e => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${e.registrationDateTime}</td><td>${e.platform}</td><td>${e.gameId}</td><td>${e.whatsapp}</td><td><strong>${e.chosenNumbers.join(', ')}</strong></td><td>${e.drawDate}</td><td><span class="pill">${e.contest}</span></td><td>${e.ticketNumber}</td><td>${statusBadge(e.status)}</td>`;
        tbody.appendChild(row);
    });
}

/**
 * ENTRIES PAGE LOGIC
 */
let entriesState = {
    currentPage: 1,
    perPage: 50,
    sortColumn: 'registrationDateTime',
    sortDirection: 'desc',
    filteredEntries: [],
    hasRechargeData: false,
    listenersAttached: false
};

async function initEntriesPage() {
    showLoading(true);
    hideError();
    try {
        await Promise.all([
            dataFetcher.fetchData(),
            rechargeValidator.fetchRechargeData()
        ]);
        const recharges = rechargeValidator.recharges || [];
        entriesState.hasRechargeData = recharges.length > 0;
        
        const rechargeStatus = document.getElementById('rechargeStatus');
        if (rechargeStatus) {
            rechargeStatus.textContent = entriesState.hasRechargeData ? `✅ ${recharges.length} recharges loaded` : '❌ No recharge data loaded';
            rechargeStatus.style.color = entriesState.hasRechargeData ? '#28a745' : '#dc3545';
        }

        updateRechargeLastUpdateTime();
        populateEntriesFilters();
        applyEntriesFiltersAndDisplay();
        setupEntriesListeners();
    } catch (error) {
        showError('Failed to load data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function updateRechargeLastUpdateTime() {
    const lastUpdate = document.getElementById('rechargeLastUpdate');
    if (lastUpdate && rechargeValidator.lastFetchTime) lastUpdate.textContent = `Last updated: ${rechargeValidator.lastFetchTime.toLocaleString('pt-BR')}`;
}

function populateEntriesFilters() {
    const contests = dataFetcher.getUniqueContests();
    const dates = dataFetcher.getUniqueDrawDates();
    const contestSelect = document.getElementById('filterContest');
    if (contestSelect && contestSelect.options.length <= 1) {
        contests.forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; contestSelect.appendChild(o); });
    }
    const dateSelect = document.getElementById('filterDrawDate');
    if (dateSelect && dateSelect.options.length <= 1) {
        dates.forEach(d => { const o = document.createElement('option'); o.value = o.textContent = d; dateSelect.appendChild(o); });
    }
}

function applyEntriesFiltersAndDisplay() {
    const gameId = document.getElementById('filterGameId')?.value.toLowerCase() || '';
    const whatsapp = document.getElementById('filterWhatsApp')?.value.toLowerCase() || '';
    const contest = document.getElementById('filterContest')?.value || '';
    const drawDate = document.getElementById('filterDrawDate')?.value || '';
    const validity = document.getElementById('filterValidity')?.value || '';
    const cutoffFlag = document.getElementById('filterCutoff')?.value || '';
    
    let entries = dataFetcher.getAllEntries();
    if (entriesState.hasRechargeData) {
        entries = rechargeValidator.validateEntries(entries);
    } else {
        entries = entries.map(e => ({ ...e, validity: 'UNKNOWN', invalidReasonCode: 'NO_RECHARGE_DATA', boundRechargeId: null }));
    }
    
    entriesState.filteredEntries = entries.filter(e => {
        if (gameId && !e.gameId.toLowerCase().includes(gameId)) return false;
        if (whatsapp && !e.whatsapp.toLowerCase().includes(whatsapp)) return false;
        if (contest && e.contest !== contest) return false;
        if (drawDate && e.drawDate !== drawDate) return false;
        if (validity && e.validity !== validity) return false;
        if (cutoffFlag === 'true' && !e.cutoffFlag) return false;
        return true;
    });
    
    sortEntries();
    entriesState.currentPage = 1;
    displayEntries();
    if (entriesState.hasRechargeData) updateValidationStats();
}

function updateValidationStats() {
    const stats = rechargeValidator.getStatistics();
    setText('validCount', stats.validTickets);
    setText('invalidCount', stats.invalidTickets);
    setText('cutoffCount', stats.cutoffShiftCases);
    setText('totalRecharges', stats.totalRecharges);
    const el = document.getElementById('validationStats');
    if (el) el.style.display = 'grid';
}

function sortEntries() {
    entriesState.filteredEntries.sort((a, b) => {
        let aVal = a[entriesState.sortColumn], bVal = b[entriesState.sortColumn];
        if (entriesState.sortColumn === 'chosenNumbers') { aVal = a.chosenNumbers.join(','); bVal = b.chosenNumbers.join(','); }
        if (aVal < bVal) return entriesState.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return entriesState.sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function displayEntries() {
    const tbody = document.getElementById('entriesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const pageEntries = entriesState.filteredEntries.slice((entriesState.currentPage - 1) * entriesState.perPage, entriesState.currentPage * entriesState.perPage);
    
    pageEntries.forEach(e => {
        const row = tbody.insertRow();
        let valBadge = e.validity === 'VALID' ? '<span class="badge badge-validated">✅ VALID</span>' : (e.validity === 'INVALID' ? '<span class="badge badge-pending">❌ INVALID</span>' : '<span class="badge" style="background:#6c757d;color:white;">❓ UNKNOWN</span>');
        if (e.cutoffFlag) valBadge += ' <span class="badge badge-warning">⚠️ CUTOFF</span>';
        const recInfo = e.boundRechargeId ? `<div style="font-size:11px;"><strong>ID:</strong> ${e.boundRechargeId.substring(0,16)}...<br><strong>Time:</strong> ${e.boundRechargeTime}<br><strong>Amount:</strong> R$ ${e.boundRechargeAmount}</div>` : '<span style="color:#999;font-size:11px;">No recharge bound</span>';
        row.innerHTML = `<td>${valBadge}</td><td>${e.registrationDateTime}</td><td>${e.platform}</td><td>${e.gameId}</td><td>${e.whatsapp}</td><td><strong>${e.chosenNumbers.join(', ')}</strong></td><td>${e.drawDate}</td><td><span class="badge badge-primary">${e.contest}</span></td><td>${e.ticketNumber}</td><td>${recInfo}</td><td><button class="btn-primary" style="padding:5px 10px;font-size:12px;" onclick='showDispute(${JSON.stringify(e).replace(/'/g, "&apos;")})'>🔍 Details</button></td>`;
    });
    updateEntriesPagination();
}

function showDispute(entry) {
    const modal = document.getElementById('disputeModal'), content = document.getElementById('disputeContent');
    if (!modal || !content) return;
    let valExp = entry.validity === 'VALID' ? `<div style="padding:15px;background:#d4edda;border-radius:8px;border-left:4px solid #28a745;margin-bottom:20px;"><h3 style="color:#155724;margin-bottom:10px;">✅ TICKET IS VALID</h3><p style="margin:0;">This is the first ticket created after recharge <strong>${entry.boundRechargeId}</strong>.</p></div>` : (entry.validity === 'INVALID' ? `<div style="padding:15px;background:#f8d7da;border-radius:8px;border-left:4px solid #dc3545;margin-bottom:20px;"><h3 style="color:#721c24;margin-bottom:10px;">❌ TICKET IS INVALID</h3><p style="margin:0;"><strong>Reason:</strong> ${rechargeValidator.getReasonCodeText(entry.invalidReasonCode)}</p>${entry.invalidReasonCode==='NO_RECHARGE_BEFORE_TICKET'?'<p style="margin-top:10px;font-size:13px;">💡 This ticket was created without a preceding recharge, or all recharges were already consumed by earlier tickets.</p>':''}</div>` : `<div style="padding:15px;background:#fff3cd;border-radius:8px;border-left:4px solid #ffc107;margin-bottom:20px;"><h3 style="color:#856404;margin-bottom:10px;">❓ VALIDITY UNKNOWN</h3><p style="margin:0;">Upload recharge data to validate this ticket.</p></div>`);
    const cutWarn = entry.cutoffFlag ? `<div style="padding:15px;background:#fff3cd;border-radius:8px;border-left:4px solid #ffc107;margin-bottom:20px;"><h3 style="color:#856404;margin-bottom:10px;">⚠️ CUTOFF TIME SHIFT DETECTED</h3><p style="margin:0;">Recharge happened before 20:00:00, but ticket was created after 20:00:01. This ticket belongs to tomorrow's draw.</p></div>` : '';
    content.innerHTML = `${valExp}${cutWarn}<h3 style="margin-bottom:15px;">📋 Ticket Information</h3><table style="width:100%;margin-bottom:20px;"><tr><td><strong>Game ID:</strong></td><td>${entry.gameId}</td></tr><tr><td><strong>Platform:</strong></td><td>${entry.platform}</td></tr><tr><td><strong>WhatsApp:</strong></td><td>${entry.whatsapp}</td></tr><tr><td><strong>Ticket #:</strong></td><td>${entry.ticketNumber}</td></tr><tr><td><strong>Registration Time:</strong></td><td>${entry.registrationDateTime}</td></tr><tr><td><strong>Contest:</strong></td><td>${entry.contest}</td></tr><tr><td><strong>Draw Date:</strong></td><td>${entry.drawDate}</td></tr><tr><td><strong>Chosen Numbers:</strong></td><td><strong>${entry.chosenNumbers.join(', ')}</strong></td></tr></table>${entry.boundRechargeId ? `<h3 style="margin-bottom:15px;">💳 Bound Recharge Information</h3><table style="width:100%;"><tr><td><strong>Recharge ID:</strong></td><td>${entry.boundRechargeId}</td></tr><tr><td><strong>Recharge Time:</strong></td><td>${entry.boundRechargeTime}</td></tr><tr><td><strong>Recharge Amount:</strong></td><td>R$ ${entry.boundRechargeAmount}</td></tr></table>` : '<p style="color:#999;font-style:italic;">No recharge data available for this ticket.</p>'}`;
    modal.classList.add('active');
}

function updateEntriesPagination() {
    const pi = document.getElementById('pageInfo'), pb = document.getElementById('prevPageBtn'), nb = document.getElementById('nextPageBtn');
    if (!pi || !pb || !nb) return;
    const tp = Math.ceil(entriesState.filteredEntries.length / entriesState.perPage);
    pi.textContent = `Page ${entriesState.currentPage} of ${tp} (${entriesState.filteredEntries.length} entries)`;
    pb.disabled = entriesState.currentPage === 1; nb.disabled = entriesState.currentPage >= tp;
}

function setupEntriesListeners() {
    if (entriesState.listenersAttached) return;
    document.getElementById('applyFiltersBtn')?.addEventListener('click', applyEntriesFiltersAndDisplay);
    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => { ['filterGameId','filterWhatsApp','filterContest','filterDrawDate','filterValidity','filterCutoff'].forEach(id=>document.getElementById(id).value=''); applyEntriesFiltersAndDisplay(); });
    document.getElementById('exportBtn')?.addEventListener('click', () => {
        let csv = 'Validity,Registration Date/Time,Platform,Game ID,WhatsApp,Chosen Numbers,Draw Date,Contest,Ticket #,Bound Recharge ID,Recharge Time,Recharge Amount,Invalid Reason,Cutoff Flag\n';
        entriesState.filteredEntries.forEach(e => csv += `"${e.validity}","${e.registrationDateTime}","${e.platform}","${e.gameId}","${e.whatsapp}","${e.chosenNumbers.join(', ')}","${e.drawDate}","${e.contest}","${e.ticketNumber}","${e.boundRechargeId||''}","${e.boundRechargeTime||''}","${e.boundRechargeAmount||''}","${e.invalidReasonCode||''}","${e.cutoffFlag?'YES':'NO'}"\n`);
        downloadCSV(csv, `entries_export_${new Date().toISOString()}`);
    });
    document.getElementById('prevPageBtn')?.addEventListener('click', () => { if(entriesState.currentPage>1){ entriesState.currentPage--; displayEntries(); } });
    document.getElementById('nextPageBtn')?.addEventListener('click', () => { if(entriesState.currentPage < Math.ceil(entriesState.filteredEntries.length/entriesState.perPage)){ entriesState.currentPage++; displayEntries(); } });
    document.getElementById('perPageSelect')?.addEventListener('change', (e) => { entriesState.perPage = parseInt(e.target.value); entriesState.currentPage = 1; displayEntries(); });
    document.querySelectorAll('#entriesTable th[data-sort]').forEach(th => th.addEventListener('click', () => { const col = th.getAttribute('data-sort'); entriesState.sortDirection = entriesState.sortColumn === col && entriesState.sortDirection === 'asc' ? 'desc' : 'asc'; entriesState.sortColumn = col; applyEntriesFiltersAndDisplay(); }));
    document.getElementById('disputeModal')?.addEventListener('click', (e) => { if(e.target.id==='disputeModal') e.target.classList.remove('active'); });
    entriesState.listenersAttached = true;
}

/**
 * RESULTS PAGE LOGIC
 */
async function initResultsPage() {
    showLoading(true);
    hideError();
    try {
        await resultsFetcher.fetchResults();
        validator.setResults(resultsFetcher.getAllResults());
        const tbody = document.getElementById('resultsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const res = validator.getAllResults();
        if (res.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum resultado encontrado</td></tr>'; return; }
        res.forEach(r => { const row = tbody.insertRow(); row.innerHTML = `<td><span class="badge badge-primary">${r.contest}</span></td><td>${r.drawDate}</td><td><strong style="font-size:18px;color:#1e3c72;">${r.winningNumbers.join(', ')}</strong></td><td>${new Date(r.savedAt).toLocaleString('pt-BR')}</td><td><span class="badge badge-validated">RESULT Sheet</span></td>`; });
    } catch (error) {
        showError('Failed to load data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * WINNERS PAGE LOGIC
 */
let winnersState = { allWinners: [], filteredWinners: [], listenersAttached: false };
async function initWinnersPage() {
    showLoading(true);
    hideError();
    try {
        await Promise.all([
            dataFetcher.fetchData(),
            resultsFetcher.fetchResults(),
            rechargeValidator.fetchRechargeData()
        ]);
        validator.setResults(resultsFetcher.getAllResults());
        populateWinnersFilters();
        validateAndDisplayWinners();
        renderTicketCreatorsComparison();
        setupWinnersListeners();
    } catch (error) {
        showError('Failed to load data: ' + error.message);
    } finally {
        showLoading(false);
    }
}
function populateWinnersFilters() {
    const c = dataFetcher.getUniqueContests(), d = dataFetcher.getUniqueDrawDates(), cs = document.getElementById('winnersFilterContest'), ds = document.getElementById('winnersFilterDrawDate');
    if (cs && cs.options.length <= 1) c.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; cs.appendChild(o); });
    if (ds && ds.options.length <= 1) d.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; ds.appendChild(o); });
}
function validateAndDisplayWinners() {
    const e = dataFetcher.getAllEntries(), r = validator.getAllResults();
    if (r.length === 0) { setText('sum5',0);setText('sum4',0);setText('sum3',0);setText('sum2',0);setText('sum1',0);setText('sumTotal',0); return; }
    winnersState.allWinners = validator.getWinners(e); applyWinnersFilters();
}
function applyWinnersFilters() {
    const c = document.getElementById('winnersFilterContest')?.value || '', d = document.getElementById('winnersFilterDrawDate')?.value || '', pt = document.getElementById('filterPrizeTier')?.value || '', w = document.getElementById('winnersFilterWhatsApp')?.value.toLowerCase() || '';
    winnersState.filteredWinners = winnersState.allWinners.filter(win => { if(c && win.contest!==c) return false; if(d && win.drawDate!==d) return false; if(pt && win.validation.matches!==parseInt(pt,10)) return false; if(w && !win.whatsapp.toLowerCase().includes(w)) return false; return true; });
    displayWinnersList(); updateWinnersSummary(winnersState.filteredWinners);
}
function displayWinnersList() {
    const tbody = document.getElementById('winnersTableBody'); if (!tbody) return; tbody.innerHTML = '';
    winnersState.filteredWinners.forEach(win => {
        const v = win.validation, row = tbody.insertRow();
        let pe = '', pbc = ''; switch(v.matches){ case 5:pe='🏆';pbc='badge-gold';break; case 4:pe='🥈';pbc='badge-silver';break; case 3:pe='🥉';pbc='badge-bronze';break; case 2:pe='🎯';pbc='badge-green';break; case 1:pe='✨';pbc='badge-pending';break; }
        const ch = win.chosenNumbers.map(n => v.matchedNumbers.includes(n) ? `<span style="background:#4CAF50;color:white;padding:2px 6px;border-radius:4px;font-weight:bold;">${n}</span>` : `<span>${n}</span>`).join(', ');
        const ma = v.matchedNumbers.map(n => `<span style="background:#FFD700;color:#333;padding:2px 6px;border-radius:4px;font-weight:bold;">${n}</span>`).join(', ');
        row.innerHTML = `<td><span class="badge ${pbc}">${pe} ${v.prizeTier.tier}</span></td><td><strong style="font-size:20px;color:#1e3c72;">${v.matches}</strong></td><td>${win.registrationDateTime}</td><td>${win.gameId}</td><td><strong>${win.whatsapp}</strong></td><td style="font-size:14px;">${ch}</td><td style="font-size:14px;"><strong>${v.winningNumbers.join(', ')}</strong></td><td style="font-size:14px;">${ma}</td><td>${win.drawDate}</td><td><span class="badge badge-primary">${win.contest}</span></td><td>${win.ticketNumber}<br><small>R$ ${win.prize?win.prize.toFixed(2):'0.00'}</small></td>`;
    });
}
function updateWinnersSummary(l) { const c = {1:0,2:0,3:0,4:0,5:0}; l.forEach(w => c[w.validation.matches]++); setText('sum5',c[5]); setText('sum4',c[4]); setText('sum3',c[3]); setText('sum2',c[2]); setText('sum1',c[1]); setText('sumTotal',l.length); }
function renderTicketCreatorsComparison() {
    const e = dataFetcher.getAllEntries(), b = {}; e.forEach(en => { const k = dateKeyFromString(en.registrationDateTime); if(k){ if(!b[k]) b[k]=new Set(); b[k].add(en.gameId); } });
    const tISO = new Date().toISOString().slice(0,10), yISO = new Date(Date.now()-86400000).toISOString().slice(0,10), tc = b[tISO]?b[tISO].size:0, yc = b[yISO]?b[yISO].size:0, mc = Math.max(tc,yc,1);
    const tb = document.getElementById('todayBarFill'), yb = document.getElementById('yesterdayBarFill'); if(tb) tb.style.height = `${(tc/mc*100).toFixed(0)}%`; if(yb) yb.style.height = `${(yc/mc*100).toFixed(0)}%`;
    setText('todayCount',tc); setText('yesterdayCount',yc);
}
function setupWinnersListeners() {
    if (winnersState.listenersAttached) return;
    document.getElementById('validateBtn')?.addEventListener('click', validateAndDisplayWinners);
    document.getElementById('exportWinnersBtn')?.addEventListener('click', () => {
        if(winnersState.filteredWinners.length===0){alert('No winners to export');return;}
        let csv = 'Prize Tier,Matches,Registration Date/Time,Game ID,WhatsApp,Chosen Numbers,Winning Numbers,Matched Numbers,Draw Date,Contest,Ticket #\n';
        winnersState.filteredWinners.forEach(w => { const v=w.validation; csv+=`"${v.prizeTier.tier}","${v.matches}","${w.registrationDateTime}","${w.gameId}","${w.whatsapp}","${w.chosenNumbers.join(', ')}","${v.winningNumbers.join(', ')}","${v.matchedNumbers.join(', ')}","${w.drawDate}","${w.contest}","${w.ticketNumber}"\n`; });
        downloadCSV(csv, `winners_export_${new Date().toISOString()}`);
    });
    document.getElementById('winnersClearFiltersBtn')?.addEventListener('click', () => { ['winnersFilterContest','winnersFilterDrawDate','filterPrizeTier','winnersFilterWhatsApp'].forEach(id=>document.getElementById(id).value=''); applyWinnersFilters(); });
    ['winnersFilterContest','winnersFilterDrawDate','filterPrizeTier'].forEach(id=>document.getElementById(id)?.addEventListener('change',applyWinnersFilters));
    document.getElementById('winnersFilterWhatsApp')?.addEventListener('input',applyWinnersFilters);
    winnersState.listenersAttached = true;
}

/**
 * UTILS
 */
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function dateKeyFromString(s) { 
    if (!s) return null; 
    
    // Check for DD/MM/YYYY HH:MM:SS or DD/MM/YYYY
    if (s.includes('/')) {
        const parts = s.split(' ');
        const dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
            let d = dateParts[0], m = dateParts[1], y = dateParts[2];
            // Normalize to YYYY-MM-DD
            // If the first part is > 12, it's definitely the day
            if (parseInt(d) > 12) {
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            // Otherwise, we assume DD/MM/YYYY as it's common in pt-BR
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }

    const p = new Date(s); 
    if (!isNaN(p.getTime())) return p.toISOString().slice(0,10); 
    
    const n = s.replace(' ', 'T'), r = new Date(n); 
    return isNaN(r.getTime()) ? null : r.toISOString().slice(0,10); 
}

function statusBadge(s) { const n = (s||'').toUpperCase(); if (n==='VALIDADO'||n==='VALIDATED') return '<span class="badge badge-validated">Validated</span>'; if (n==='PENDENTE'||n==='PENDING') return '<span class="badge badge-pending">Pending</span>'; return `<span class="badge badge-silver">${s||'—'}</span>`; }
function showLoading(s) { const el = document.getElementById('loadingIndicator'); if(el) el.style.display = s?'block':'none'; }
function hideError() { const el = document.getElementById('errorMessage'); if(el) el.style.display = 'none'; }
function showError(m) { const el = document.getElementById('errorMessage'); if(el){ el.textContent = m; el.style.display = 'block'; } }
function updateLastUpdateTime() { const el = document.getElementById('lastUpdate'); if(el && dataFetcher.lastFetchTime) el.textContent = dataFetcher.lastFetchTime.toLocaleString('pt-BR'); }
function setAccountBanner() { const el = document.getElementById('accountBanner'); if(!el || typeof getSession !== 'function') return; const s = getSession(); el.textContent = s && s.account ? `Logged in as: ${s.account}` : 'Logged in as: (session missing)'; }
function downloadCSV(c, f) { const b = new Blob([c],{type:'text/csv'}), u = window.URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = f+'.csv'; a.click(); }

function setupAutoRefresh() {
    setInterval(async () => {
        try {
            await Promise.all([dataFetcher.fetchData(), resultsFetcher.fetchResults(), rechargeValidator.fetchRechargeData()]);
            validator.setResults(resultsFetcher.getAllResults());
            updateDashboard();
            updateLastUpdateTime();
        } catch (e) { console.error('Auto-refresh failed:', e); }
    }, 60000);
}

function initializePage(pageId) {
    switch (pageId) {
        case 'dashboard': updateDashboard(); break;
        case 'entries': initEntriesPage(); break;
        case 'results': initResultsPage(); break;
        case 'winners': initWinnersPage(); break;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    setupAutoRefresh();
    
    // Add listener for chart metric change
    document.getElementById('chartMetricSelect')?.addEventListener('change', () => {
        const entries = dataFetcher.getAllEntries();
        const recharges = rechargeValidator.recharges || [];
        const metric = document.getElementById('chartMetricSelect').value;
        renderEntriesVolumeChart(entries, recharges, metric);
    });

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        const activeLink = document.querySelector('.nav-link.active');
        const activePage = activeLink ? activeLink.getAttribute('data-page') : 'dashboard';
        initDashboard().then(() => initializePage(activePage));
    });
});
