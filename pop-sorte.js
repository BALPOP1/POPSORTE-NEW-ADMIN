// POP-SORTE LOTTERY SYSTEM - FULL REVAMP WITH SECURE WORKER API
// ✅ WORKER URL CONFIGURED
const API_BASE_URL = 'https://popsorte-api.danilla-vargas1923.workers.dev';

// Changes: WhatsApp instead of Pedido, UNLIMITED registrations per Game ID, proper Concurso system, no SN
let selectedNumbers = []; // Array to preserve order
let selectedPlatform = null;
const CONCURSO_REFERENCE = {
    number: 6903,
    date: new Date('2025-12-15T00:00:00-03:00') // Explicit Brazil time
};

// Helper to get current time in Brazil timezone
function getBrazilTime() {
    const now = new Date();
    // Use Intl.DateTimeFormat to get Brazil time components
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;
    // Create date in Brazil timezone explicitly
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
}

// Helper to format date/time in Brazil timezone
function formatBrazilDateTime(date, options = {}) {
    // Always format using Brazil timezone, regardless of user's local timezone
    return date.toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo', 
        ...options 
    });
}

// Helper to get YYYY-MM-DD in Brazil timezone
function getBrazilDateString(date) {
    // Use Intl.DateTimeFormat to get Brazil date components
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}

// Draw calendar helpers (BRT)
function isNoDrawDay(date) {
    const month = date.getMonth(); // 0-indexed
    const day = date.getDate();
    const isChristmas = month === 11 && day === 25;
    const isNewYear = month === 0 && day === 1;
    return isChristmas || isNewYear;
}

function isEarlyDrawDay(date) {
    const month = date.getMonth();
    const day = date.getDate();
    return (month === 11 && (day === 24 || day === 31));
}

function getDrawTimeHour(date) {
    return isEarlyDrawDay(date) ? 17 : 20;
}

function isValidDrawDay(date) {
    const isSunday = date.getDay() === 0;
    return !isSunday && !isNoDrawDay(date);
}

function buildScheduleForDate(dateInput) {
    const dateStr = typeof dateInput === 'string'
        ? dateInput.split('T')[0]
        : getBrazilDateString(dateInput);

    const drawDate = new Date(`${dateStr}T00:00:00-03:00`);
    const drawHour = getDrawTimeHour(drawDate);

    const cutoff = new Date(`${dateStr}T${drawHour.toString().padStart(2, '0')}:00:00-03:00`);
    cutoff.setSeconds(cutoff.getSeconds() - 1); // 19:59:59 or 16:59:59

    const regStartDate = new Date(drawDate);
    regStartDate.setDate(regStartDate.getDate() - 1);
    const regStartStr = getBrazilDateString(regStartDate);
    const regStart = new Date(`${regStartStr}T20:00:01-03:00`); // 20:00:01 of previous day

    return { drawDate, drawHour, cutoff, regStart };
}

function getNextValidDrawDate(fromDate) {
    const probe = new Date(fromDate);
    probe.setHours(0, 0, 0, 0);

    for (let i = 0; i < 14; i++) {
        if (i > 0) probe.setDate(probe.getDate() + 1);
        if (isValidDrawDay(probe)) {
            return new Date(probe);
        }
    }
    throw new Error('No valid draw date found in range');
}

function getCurrentDrawSchedule() {
    const spNow = getBrazilTime(); // Use corrected Brazil time function
    const todayStr = getBrazilDateString(spNow);
    const today = new Date(`${todayStr}T00:00:00-03:00`);

    const todayValid = isValidDrawDay(today);
    if (todayValid) {
        const schedule = buildScheduleForDate(todayStr);
        if (spNow <= schedule.cutoff) {
            return { ...schedule, now: spNow };
        }
    }

    // After cutoff or today invalid: pick next valid draw day (skipping Sundays and blocked days)
    let probe = new Date(today);
    for (let i = 0; i < 14; i++) {
        probe.setDate(probe.getDate() + 1);
        const probeStr = getBrazilDateString(probe);
        const probeDate = new Date(`${probeStr}T00:00:00-03:00`);
        if (isValidDrawDay(probeDate)) {
            const nextSchedule = buildScheduleForDate(probeStr);
            return { ...nextSchedule, now: spNow };
        }
    }
    throw new Error('No valid draw date found');
}

// Calculate concurso number based on draw date while skipping non-draw days (Sundays + holiday closures)
function calculateConcurso(drawDate) {
    const refDateStr = getBrazilDateString(CONCURSO_REFERENCE.date);
    const targetDateStr = typeof drawDate === 'string'
        ? drawDate.split('T')[0]
        : getBrazilDateString(drawDate);

    const refDate = new Date(`${refDateStr}T12:00:00Z`);      // use noon UTC to avoid DST issues
    const targetDate = new Date(`${targetDateStr}T12:00:00Z`);

    let daysDiff = 0;
    let cursor = new Date(refDate);
    const step = targetDate >= refDate ? 1 : -1;

    while ((step === 1 && cursor < targetDate) || (step === -1 && cursor > targetDate)) {
        cursor.setUTCDate(cursor.getUTCDate() + step);
        const cursorStr = cursor.toISOString().split('T')[0];
        const cursorBrazil = new Date(`${cursorStr}T12:00:00-03:00`);
        if (isValidDrawDay(cursorBrazil)) {
            daysDiff += 1;
        }
    }

    return CONCURSO_REFERENCE.number + daysDiff * step;
}

// Get weekday name in Portuguese
function getWeekdayName(date) {
    const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    return days[date.getDay()];
}

// Initialize everything immediately (since script is at bottom of body)
generateNumberGrid();
updateSelectedDisplay();
updateSubmitButton();
initCountdown();
updateDrawDateDisplay();
updateConfirmationWarning();
setupGameIdInput();
setupWhatsappInput();
initPlatformSelection();
fetchAndPopulateResults();
bindUiEvents();
initLatestFiveWidget();

// ✅ SECURE: Fetch latest results via Worker API (read-only data, no auth required)
async function fetchAndPopulateResults() {
    // Note: Results are public data, fetched from public sheet via Worker for consistency
    const RESULTS_CSV_URL = `${API_BASE_URL}/api/admin/results`;
    const WINNERS_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1OttNYHiecAuGG6IRX7lW6lkG5ciEcL8gp3g6lNrN9H8/export?format=csv&gid=2087629111';
    
    const marqueeBalls = document.getElementById('marqueeBalls');
    const marqueeContainer = document.querySelector('.results-marquee');
    const marqueeContent = document.getElementById('marqueeContent');
    
    if (!marqueeBalls || !marqueeContainer || !marqueeContent) return;

    // Helper function to check if a draw is valid
    const isValidDraw = (row) => {
        if (row.length < 7) return false;
        const contest = row[0].trim();
        const dateStr = row[1].trim();
        const nums = row.slice(2, 7).map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        
        // Must have contest number, date, and 5 numbers
        if (!contest || !dateStr || nums.length !== 5) return false;
        
        // Check if it's a "No draw" entry
        const fullRow = row.join(' ').toLowerCase();
        if (fullRow.includes('no draw')) return false;
        
        return true;
    };

    const updateAndAnimate = (latestResult, winners = []) => {
        if (!marqueeBalls || !marqueeContent) return;
        
        marqueeBalls.innerHTML = '';
        
        // Destructure with fallbacks for local JSON format vs CSV format
        const nums = latestResult.numbers || [];
        const drawNumber = latestResult.drawNumber || latestResult.contest || '---';
        const dateStr = latestResult.date || '';
        
        // Format date for Brazil
        let formattedDate = '';
        if (dateStr) {
            try {
                // Try YYYY-MM-DD
                if (dateStr.includes('-')) {
                    const [y, m, d] = dateStr.split('-').map(Number);
                    const dateObj = new Date(y, m - 1, d);
                    formattedDate = dateObj.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                } else {
                    formattedDate = dateStr;
                }
            } catch (e) { formattedDate = dateStr; }
        }

        // Create/Update prefix
        let prefix = document.getElementById('marqueePrefix');
        if (!prefix) {
            prefix = document.createElement('span');
            prefix.id = 'marqueePrefix';
            marqueeBalls.parentNode.insertBefore(prefix, marqueeBalls);
        }
        prefix.innerHTML = `<span style="color:#ffffff;">ÚLTIMO RESULTADO: </span>`;

        // Remove any old suffix sibling (we will place it inside the flow)
        const oldSuffix = document.getElementById('marqueeSuffix');
        if (oldSuffix) oldSuffix.remove();

        // Add result balls
        if (nums && nums.length > 0) {
            nums.forEach(num => {
                const badge = document.createElement('div');
                badge.className = 'number-badge ' + getBallColorClass(num);
                const numberText = document.createElement('span');
                numberText.className = 'number-text';
                numberText.textContent = num.toString().padStart(2, '0');
                badge.appendChild(numberText);
                marqueeBalls.appendChild(badge);
            });
        }

        // Insert suffix right after numbers (before winners)
        if (drawNumber) {
            const suffixInside = document.createElement('span');
            suffixInside.id = 'marqueeSuffix';
            suffixInside.innerHTML = ` <span style="padding:2px 8px; border-radius:8px; font-weight:700; color:#ffffff; display:inline-flex; gap:6px; align-items:center;">
                <span style="color:#ffffff;">[ CONCURSO <b>#${drawNumber}</b></span>
                <span style="color:#ffffff;"> 📅 DATA: <b>${formattedDate}</b> ]</span>
               </span> `;
            marqueeBalls.appendChild(suffixInside);
        }

        // Add winners directly into marqueeBalls to ensure they are visible and looped
        if (winners && winners.length > 0) {
            const sep = document.createElement('span');
            sep.innerHTML = ' 🏆 ';
            sep.style.margin = '0 10px';
            sep.style.fontWeight = 'bold';
            marqueeBalls.appendChild(sep);

            const winnersTitle = document.createElement('span');
            winnersTitle.innerHTML = '<b>GANHADOR(ES):</b> ';
            winnersTitle.style.color = '#cb24e9ff';
            winnersTitle.style.marginRight = '8px';
            marqueeBalls.appendChild(winnersTitle);

            winners.forEach((win) => {
                const winTag = document.createElement('span');
                winTag.className = 'winner-info';
                winTag.style.display = 'inline-flex';
                winTag.style.alignItems = 'center';
                winTag.style.gap = '6px';
                winTag.style.background = 'linear-gradient(180deg, #FFF 0%, #FFF 50%, #FFF 100%)';
                winTag.style.animation = 'pulseWinner 1.2s ease-in-out infinite';
                winTag.style.padding = '3px 10px';
                winTag.style.borderRadius = '8px';
                winTag.style.border = '2px solid #cb24e9ff';
                winTag.style.fontSize = '0.85rem';
                winTag.style.marginRight = '12px';
                winTag.style.color = '#1e293b';
                winTag.style.cursor = 'pointer';
                winTag.title = 'Clique para ver detalhes do ganhador';

                const gameIdShort = win.gameId;
                const winDate = (win.drawDate || '').split(' ')[0];
                const platform = (win.platform || 'POPN1').toUpperCase();
                
                // Construct inner HTML with Game ID and Date
                let innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">
                    <span style="font-weight:800; color:#6c2bd9;">ID: ${gameIdShort}</span>
                    <span style="padding:2px 8px;border-radius:999px;background:#0ea5e9;color:#0b1c33;font-weight:800;font-size:0.7rem;">${platform}</span>
                </span> ` +
                `<span style="opacity:0.7; font-size:0.75rem;">(${winDate})</span> ` +
                `<span style="color:#b45309; font-weight:700;">[</span>`;
                
                // Add numbers with conditional ball badge styling
                win.chosenNumbers.forEach((num, idx) => {
                    const isMatch = nums.includes(num);
                    if (isMatch) {
                        innerHTML += `<div class="number-badge ${getBallColorClass(num)}" style="width:22px; height:22px; font-size:0.65rem; margin:0 2px;">` +
                                     `<span class="number-text">${num.toString().padStart(2, '0')}</span>` +
                                     `</div>`;
                    } else {
                        innerHTML += `<span style="margin:0 2px;">${num.toString().padStart(2, '0')}</span>`;
                    }
                    
                    if (idx < win.chosenNumbers.length - 1) {
                        innerHTML += `<span style="opacity:0.5;">,</span>`;
                    }
                });
                
                innerHTML += `<span style="color:#b45309; font-weight:700;">]</span>`;
                winTag.innerHTML = innerHTML;
                
                // Add click event to scroll to winners carousel section
                winTag.addEventListener('click', () => {
                    const carouselSection = document.getElementById('winnersCarouselSection');
                    if (carouselSection) {
                        carouselSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
                
                marqueeBalls.appendChild(winTag);
            });
        }

        // UPDATE WINNERS CAROUSEL
        updateWinnersCarousel(winners, nums);

        startMarquee();
    };

    const updateWinnersCarousel = (winners, winningNums) => {
        const carouselSection = document.getElementById('winnersCarouselSection');
        const track = document.getElementById('winnersCarouselTrack');
        const dotsContainer = document.getElementById('carouselDots');
        
        if (!carouselSection || !track || !dotsContainer) return;

        if (!winners || winners.length === 0) {
            carouselSection.style.display = 'none';
            return;
        }

        carouselSection.style.display = 'block';
        track.innerHTML = '';
        dotsContainer.innerHTML = '';

        winners.forEach((win, index) => {
            const card = document.createElement('div');
            card.className = 'winner-card';
            
            const winDate = (win.drawDate || '').split(' ')[0];
            const platform = (win.platform || 'POPN1').toUpperCase();
            
            let numsHTML = '';
            win.chosenNumbers.forEach(num => {
                const isMatch = winningNums.includes(num);
                if (isMatch) {
                    numsHTML += `<div class="winner-num-item match number-badge ${getBallColorClass(num)}">` +
                                `<span class="number-text">${num.toString().padStart(2, '0')}</span></div>`;
                } else {
                    numsHTML += `<div class="winner-num-item">${num.toString().padStart(2, '0')}</div>`;
                }
            });

            card.innerHTML = `
                <div class="winner-card-header">
                    <div class="winner-badge-pill">🏆 GANHADOR</div>
                    <span style="color: #64748b; font-size: 0.85rem; font-weight: 600;">SORTEIO: ${winDate}</span>
                    <span style="margin-left:auto; padding:4px 10px; border-radius:999px; background:#0ea5e9; color:#0b1c33; font-weight:800; font-size:0.75rem;">${platform}</span>
                </div>
                <div class="winner-id-text">ID: <strong>${win.gameId}</strong></div>
                <div class="winner-numbers-display">
                    ${numsHTML}
                </div>
                <div style="font-size: 0.85rem; color: #10b981; font-weight: 800;">
                    ${win.matches} ACERTOS! PARABÉNS! 🎉
                </div>
            `;
            track.appendChild(card);

            // Add dots
            const dot = document.createElement('div');
            dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
            dot.onclick = () => goToSlide(index);
            dotsContainer.appendChild(dot);
        });

        // Initialize Carousel
        let currentSlide = 0;
        const totalSlides = winners.length;
        
        function goToSlide(n) {
            currentSlide = n;
            track.style.transform = `translateX(-${n * 100}%)`;
            
            // Update dots
            const dots = dotsContainer.querySelectorAll('.carousel-dot');
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === n);
            });
        }

        // Auto-slide if more than 1 winner
        if (totalSlides > 1) {
            if (window.winnersCarouselInterval) clearInterval(window.winnersCarouselInterval);
            window.winnersCarouselInterval = setInterval(() => {
                currentSlide = (currentSlide + 1) % totalSlides;
                goToSlide(currentSlide);
            }, 5000);
        }
    };

    const startMarquee = () => {
        if (!marqueeContainer || !marqueeContent) return;

        // RE-SYNC ANIMATION
        const existingClones = marqueeContainer.querySelectorAll('.marquee-content:not([id="marqueeContent"])');
        existingClones.forEach(el => el.remove());
        
        marqueeContent.classList.remove('is-animating');
        
        const clone = marqueeContent.cloneNode(true);
        clone.id = ""; 
        clone.classList.remove('is-animating'); 
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        marqueeContainer.appendChild(clone);

        void marqueeContent.offsetWidth;
        void clone.offsetWidth;

        marqueeContent.classList.add('is-animating');
        clone.classList.add('is-animating');
    };

    try {
        // Fetch Results from Worker API
        let latestResult = null;
        try {
            const res = await fetch(RESULTS_CSV_URL);
            if (res.ok) {
                const csv = await res.text();
                const lines = csv.split('\n').filter(Boolean);
                if (lines.length > 1) {
                    // Find the last valid draw (skip "No draw" entries)
                    for (let i = lines.length - 1; i >= 1; i--) {
                        const row = parseCSVLine(lines[i]);
                        if (isValidDraw(row)) {
                            const nums = row.slice(2, 7).map(v => parseInt(v, 10)).filter(n => !isNaN(n));
                            const dateParts = (row[1] || '').split('/');
                            const dateISO = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}` : getBrazilDateString(new Date());
                            latestResult = {
                                drawNumber: row[0],
                                date: dateISO,
                                numbers: nums
                            };
                            break; // Found the latest valid draw
                        }
                    }
                }
            }
        } catch (e) { console.warn('Results fetch failed'); }

        if (!latestResult) throw new Error('Could not fetch results');

        // 2. Fetch Winners from Winners Sheet
        let winners = [];
        try {
            const res = await fetch(WINNERS_SHEET_CSV_URL);
            if (res.ok) {
                const csv = await res.text();
                const lines = csv.split('\n').filter(Boolean);
                const delimiter = detectDelimiter(lines[0] || '');
                const targetContest = String(latestResult.drawNumber || latestResult.contest || '').trim().replace('#', '');
                
                for (let i = 1; i < lines.length; i++) {
                    const row = parseCSVLine(lines[i], delimiter);
                    if (row.length >= 9) {
                        const winnerContest = String(row[0] || '').trim().replace('#', '');
                        if (winnerContest === targetContest) {
                            // Parse winner data from sheet
                            const winner = {
                                platform: (row[1] || 'POPN1').toString().trim().toUpperCase(), // Column B
                                gameId: row[2], // Column C
                                whatsapp: row[3], // Column D
                                chosenNumbers: (row[4] || '').split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)), // Column E
                                drawDate: row[5], // Column F
                                contest: row[6], // Column G
                                matches: parseInt(row[7] || '0'), // Column H - matches count
                                status: row[8] || 'VALID' // Column I
                            };
                            winners.push(winner);
                        }
                    }
                }
                
                // Sort winners by matches desc
                winners = winners.sort((a, b) => b.matches - a.matches);
            }
        } catch (e) { console.warn('Winners fetch failed', e); }

        updateAndAnimate(latestResult, winners);

    } catch (error) {
        console.error('All results sources failed:', error);
        // Marquee MUST always have content, never empty
        marqueeBalls.innerHTML = '<span class="marquee-loading">CARREGANDO RESULTADOS...</span>';
        startMarquee();
    }
}

// Simple CSV line parser
function parseCSVLine(line, delimiter = ',') {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else current += ch;
    }
    values.push(current.trim());
    return values;
}

function detectDelimiter(headerLine) {
    const counts = {
        ',': (headerLine.match(/,/g) || []).length,
        ';': (headerLine.match(/;/g) || []).length,
        '\t': (headerLine.match(/\t/g) || []).length,
        '|': (headerLine.match(/\|/g) || []).length,
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

function parseBrDateTime(str) {
    if (!str) return null;
    try {
        const [datePart, timePart = '00:00:00'] = str.trim().split(' ');
        const [d, m, y] = datePart.split(/[\/-]/).map(Number);
        const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
        if (!d || !m || !y) return null;
        return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, ss));
    } catch {
        return null;
    }
}

function maskWhatsappNumber(value) {
    if (!value) return '****';
    const digits = value.replace(/\D/g, '');
    if (digits.length < 4) return '****';
    return '***' + digits.slice(-4);
}

function normalizeTicketStatus(status) {
    const up = (status || '').toUpperCase();
    if (up === 'VALID' || up === 'VALIDADO') return 'valid';
    if (up === 'INVALID' || up === 'INVÁLIDO') return 'invalid';
    return 'pending';
}

function ticketStatusLabel(cls) {
    if (cls === 'valid') return 'VÁLIDO';
    if (cls === 'invalid') return 'INVÁLIDO';
    return '⏳ Em verificação...';
}

// ✅ SECURE: Latest 5 widget fetches via Worker API (public data)
function initLatestFiveWidget() {
    const listEl = document.getElementById('latest5List');
    const errEl = document.getElementById('latest5Error');
    if (!listEl) return;

    // Use Google Sheets CSV export with blurred data (secure)
    const latest5Url = 'https://docs.google.com/spreadsheets/d/1OttNYHiecAuGG6IRX7lW6lkG5ciEcL8gp3g6lNrN9H8/export?format=csv&gid=0';

    const render = (entries) => {
        if (errEl) errEl.style.display = 'none';
        listEl.innerHTML = '';

        if (!entries.length) {
            listEl.innerHTML = '<div class="latest5-loading">Nenhum bilhete carregado.</div>';
            return;
        }

        entries.forEach(entry => {
            const badgeCls = normalizeTicketStatus(entry.status);
            const numbersHTML = (entry.numbers || []).slice(0, 5).map(num => {
                const colorClass = getBallColorClass(num);
                return `<span class="number-badge ${colorClass}">${String(num).padStart(2, '0')}</span>`;
            }).join('');

            const card = document.createElement('div');
            card.className = 'latest5-card';
            card.innerHTML = `
                <div class="latest5-main">
                    <div class="latest5-top">
                        <span class="latest5-id">ID De Jogo: ${entry.gameId || '—'}</span>
                        <span class="latest5-ticket">${entry.ticketNumber || '—'}</span>
                    </div>
                    <div class="latest5-meta">
                        <span>Concurso: ${entry.contest || '—'}</span>
                        <span>Data: ${entry.drawDate || '—'}</span>
                        <span>WhatsApp: ${maskWhatsappNumber(entry.whatsapp)}</span>
                    </div>
                    <div class="latest5-numbers">${numbersHTML}</div>
                </div>
                <div class="latest5-badge is-${badgeCls}">${ticketStatusLabel(badgeCls)}</div>
            `;
            listEl.appendChild(card);
        });
    };

    const showError = (msg) => {
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
    };

    const loadLatest = async () => {
        if (errEl) errEl.style.display = 'none';
        listEl.innerHTML = '<div class="latest5-loading">Carregando últimos bilhetes...</div>';

        try {
            // Append cache-busting parameter with & since URL already has query params
            const url = `${latest5Url}&t=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const csv = await res.text();
            
            // Check if we got HTML instead of CSV (Google Sheets might return login page)
            if (csv.trim().startsWith('<!DOCTYPE') || csv.trim().startsWith('<html')) {
                throw new Error('Received HTML instead of CSV. Sheet may not be publicly accessible.');
            }
            const lines = csv.split(/\r?\n/).filter(Boolean);
            if (lines.length <= 1) throw new Error('CSV vazio');

            const delimiter = detectDelimiter(lines[0]);
            const entries = [];

            for (let i = 1; i < lines.length; i++) {
                const row = parseCSVLine(lines[i], delimiter);
                if (row.length < 9) continue;

                const parsedDate = parseBrDateTime(row[0] || '');
                entries.push({
                    timestamp: row[0] || '',
                    parsedDate,
                    platform: row[1] || 'POPN1',
                    gameId: row[2] || '',
                    whatsapp: row[3] || '',
                    numbers: (row[4] || '').split(/[,;|\t]/).map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)),
                    drawDate: row[5] || '',
                    contest: row[6] || '',
                    ticketNumber: row[7] || '',
                    status: row[8] || 'PENDING'
                });
            }

            entries.sort((a, b) => {
                const ta = a.parsedDate ? a.parsedDate.getTime() : 0;
                const tb = b.parsedDate ? b.parsedDate.getTime() : 0;
                return tb - ta;
            });

            render(entries.slice(0, 5));
        } catch (e) {
            showError('Não foi possível carregar os últimos bilhetes.');
        }
    };

    loadLatest();
    setInterval(loadLatest, 30000);
}

// GAME ID VALIDATION - EXACTLY 10 DIGITS
const GAME_ID_REGEX = /^[0-9]{10}$/;

function isValidGameId(id) {
    return typeof id === 'string' && GAME_ID_REGEX.test(id);
}

function normalizeGameId(id) {
    if (!isValidGameId(id)) {
        throw new Error('ID de Jogo deve ter exatamente 10 dígitos');
    }
    return id;
}

// WHATSAPP BRAZIL VALIDATION - 10 or 11 DIGITS
const WHATSAPP_REGEX = /^[0-9]{10,11}$/;

function isValidWhatsApp(number) {
    return typeof number === 'string' && WHATSAPP_REGEX.test(number);
}

// Setup Game ID input with exactly 10 digit validation
function setupGameIdInput() {
    const gameIdInput = document.getElementById('gameId');
    
    gameIdInput.addEventListener('input', function(e) {
        // Remove all non-digit characters
        let value = e.target.value.replace(/\D/g, '');
        
        // Limit to exactly 10 digits
        if (value.length > 10) {
            value = value.slice(0, 10);
        }
        
        e.target.value = value;
        
        // Visual feedback
        if (value.length === 10) {
            e.target.style.borderColor = '#22c55e';
        } else {
            e.target.style.borderColor = '#e5e7eb';
        }
    });
}

// Setup WhatsApp input with Brazil format validation
function setupWhatsappInput() {
    const whatsappInput = document.getElementById('whatsappNumber');
    
    whatsappInput.addEventListener('input', function(e) {
        // Remove all non-digit characters
        let value = e.target.value.replace(/\D/g, '');
        
        // Limit to 11 digits (Brazil mobile: 11 99988 7766)
        if (value.length > 11) {
            value = value.slice(0, 11);
        }
        
        // Format for Brazil: XX XXXXX XXXX or XX XXXX XXXX
        let formatted = value;
        if (value.length > 2) {
            formatted = value.slice(0, 2) + ' ' + value.slice(2);
        }
        if (value.length > 7) {
            formatted = value.slice(0, 2) + ' ' + value.slice(2, 7) + ' ' + value.slice(7);
        }
        
        e.target.value = formatted;
        
        // Visual feedback (10-11 digits valid)
        const raw = value;
        if (raw.length >= 10 && raw.length <= 11) {
            e.target.style.borderColor = '#22c55e';
        } else {
            e.target.style.borderColor = '#e5e7eb';
        }
    });
    
    // Store raw value in data attribute for submission
    whatsappInput.addEventListener('blur', function(e) {
        const raw = e.target.value.replace(/\D/g, '');
        e.target.dataset.raw = raw;
    });
}

// Toggle WhatsApp field visibility (opt-out logic)
function toggleWhatsappField() {
    const checkbox = document.getElementById('whatsappOptOut');
    const whatsappGroup = document.getElementById('whatsappGroup');
    const whatsappInput = document.getElementById('whatsappNumber');

    // Checkbox is optional in the current markup; default to showing WhatsApp field
    if (!checkbox) {
        whatsappGroup.style.display = 'block';
        whatsappInput.required = true;
        return;
    }

    if (checkbox.checked) {
        // User doesn't want to provide WhatsApp - hide field
        whatsappGroup.style.display = 'none';
        whatsappInput.required = false;
        whatsappInput.value = '';
    } else {
        // Show WhatsApp field (default)
        whatsappGroup.style.display = 'block';
        whatsappInput.required = true;
    }
}

function initPlatformSelection() {
    const radios = document.querySelectorAll('input[name="platformChoice"]');
    const pill = document.getElementById('platformBadgePopup');
    const switchEl = document.querySelector('.platform-switch');
    if (radios.length === 0) return;

    const apply = (platform) => {
        selectedPlatform = platform || null;
        const badge = document.getElementById('platformBadgePopup');
        if (badge) {
            badge.textContent = selectedPlatform || 'ESCOLHA UMA PLATAFORMA';
        }
        updatePlatformStyles(platform);
    };

    const updatePlatformStyles = (platform) => {
        const upper = (platform || '').toUpperCase();
        const hasSelection = !!upper;
        if (switchEl) switchEl.classList.toggle('platform-active', hasSelection);
        if (pill) {
            pill.classList.toggle('platform-active', hasSelection);
            pill.setAttribute('data-platform', upper || '');
        }
        const labels = document.querySelectorAll('.platform-option');
        labels.forEach(label => {
            const input = label.querySelector('input[type="radio"]');
            const checked = !!(input && input.checked);
            label.classList.toggle('is-selected', checked);
            label.classList.toggle('is-unselected', hasSelection && !checked);
        });
    };

    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) apply(radio.value);
        });
    });

    const preselected = Array.from(radios).find(r => r.checked);
    apply(preselected ? preselected.value : null);
}

function getSelectedPlatform() {
    const radios = document.querySelectorAll('input[name="platformChoice"]');
    const checked = Array.from(radios).find(r => r.checked);
    return (checked?.value || selectedPlatform || '').toUpperCase();
}

// Generate 80 numbers
function generateNumberGrid() {
    const grid = document.getElementById('numberGrid');
    grid.innerHTML = '';
    
    for (let i = 1; i <= 80; i++) {
        const ball = document.createElement('div');
        ball.className = 'number-ball';
        ball.textContent = i.toString().padStart(2, '0');
        ball.dataset.number = i;
        ball.onclick = () => toggleNumber(i);
        grid.appendChild(ball);
    }
}

// Toggle number selection - ALWAYS SORTED
function toggleNumber(num) {
    const ball = document.querySelector(`.number-ball[data-number="${num}"]`);
    const maxNumbers = 5;
    
    const index = selectedNumbers.indexOf(num);
    
    if (index > -1) {
        selectedNumbers.splice(index, 1);
        ball.classList.remove('selected');
    } else {
        if (selectedNumbers.length < maxNumbers) {
            selectedNumbers.push(num);
            ball.classList.add('selected');
        } else {
            showToast('MÁXIMO 5 NÚMEROS!');
        }
    }
    
    // Sort numbers from smallest to largest
    selectedNumbers.sort((a, b) => a - b);
    
    updateSelectedDisplay();
    updateSubmitButton();
}

// Calculate ball color class based on grid position (matches CSS nth-child(10n+x) pattern)
function getBallColorClass(num) {
    const remainder = num % 10;
    return `ball-color-${remainder}`;
}

// Update display - SHOWS SELECTED NUMBERS WITHOUT ORDER INDICATORS
function updateSelectedDisplay() {
    const container = document.getElementById('selectedNumbers');
    const countDisplay = document.getElementById('selectedCount');
    
    container.innerHTML = '';
    
    if (selectedNumbers.length === 0) {
        container.innerHTML = '<span class="empty-state">Nenhum número selecionado</span>';
    } else {
        selectedNumbers.forEach((num) => {
            const badge = document.createElement('div');
            badge.className = 'number-badge ' + getBallColorClass(num);
            
            const numberText = document.createElement('span');
            numberText.className = 'number-text';
            numberText.textContent = num.toString().padStart(2, '0');
            
            badge.appendChild(numberText);
            container.appendChild(badge);
        });
    }
    
    countDisplay.textContent = `${selectedNumbers.length}/5 números`;
    countDisplay.className = 'selected-count';
    
    if (selectedNumbers.length >= 5 && selectedNumbers.length <= 20) {
        countDisplay.classList.add('complete');
    }
}

// Clear numbers
function clearNumbers() {
    selectedNumbers = [];
    document.querySelectorAll('.number-ball.selected').forEach(ball => {
        ball.classList.remove('selected');
    });
    updateSelectedDisplay();
    updateSubmitButton();
}

// Surpresinha - random EXACTLY 5 numbers with sorting
function surpresinha() {
    clearNumbers();
    
    const quantity = 5;
    const numbers = [];
    
    for (let i = 1; i <= 80; i++) {
        numbers.push(i);
    }
    
    // Shuffle using Fisher-Yates algorithm
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    
    // Select first 5 numbers and SORT them
    const selectedRandom = numbers.slice(0, quantity).sort((a, b) => a - b);
    
    selectedRandom.forEach(num => {
        selectedNumbers.push(num);
        const ball = document.querySelector(`.number-ball[data-number="${num}"]`);
        ball.classList.add('selected');
    });
    
    // Ensure selectedNumbers is sorted
    selectedNumbers.sort((a, b) => a - b);
    
    updateSelectedDisplay();
    updateSubmitButton();
    
    // Show selected numbers in toast
    const displayNumbers = selectedNumbers.map(n => n.toString().padStart(2, '0')).join(', ');
    showToast(`🎲 ${displayNumbers}`);
}

// Update submit button
function updateSubmitButton() {
    const btn = document.getElementById('submitBtn');
    
    if (selectedNumbers.length >= 5 && selectedNumbers.length <= 20) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

// Show user info popup
function showUserInfoPopup() {
    if (selectedNumbers.length < 5 || selectedNumbers.length > 20) {
        showToast('SELECIONE ENTRE 5 NÚMEROS!');
        return;
    }
    
    updateConfirmationWarning(); // Update warning with current concurso info
    document.getElementById('userInfoPopup').style.display = 'block';
}

// Update confirmation warning text
function updateConfirmationWarning() {
    const drawDate = getDrawDate();
    const drawHour = getDrawHour();
    const concurso = calculateConcurso(drawDate);
    const weekday = getWeekdayName(drawDate);
    const formattedDate = formatBrazilDateTime(drawDate, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
    
    const warningText = `Está prestes a se cadastrar no <strong>CONCURSO ${concurso}</strong> (${weekday} <strong>${formattedDate}</strong>) às <strong>${drawHour.toString().padStart(2, '0')}:00</strong> BRT.<br><br>
    Resultado será atualizado no oficial: <a href="https://loterias.caixa.gov.br/Paginas/quina.aspx" target="_blank" style="color: #0b3eccff; text-decoration: underline;">https://loterias.caixa.gov.br/Paginas/quina.aspx</a>.`;
    
    const warningElement = document.getElementById('confirmationWarning');
    if (warningElement) {
        warningElement.innerHTML = warningText;
    }
}

// Close popup
function closeUserInfoPopup() {
    document.getElementById('userInfoPopup').style.display = 'none';
    document.getElementById('gameId').value = '';
    document.getElementById('whatsappNumber').value = '';
    const optOut = document.getElementById('whatsappOptOut');
    if (optOut) {
        optOut.checked = false;
        toggleWhatsappField();
    }
}

// Calculate draw date/time with holiday and early-draw rules (BRT)
function getDrawDate() {
    const schedule = getCurrentDrawSchedule();
    return schedule.drawDate;
}

function getDrawHour() {
    const schedule = getCurrentDrawSchedule();
    return schedule.drawHour;
}

// Get cutoff period identifier
function getCutoffPeriod() {
    const drawDate = getDrawDate();
    return drawDate.toISOString().split('T')[0];
}

// ✅ SECURE: CONFIRM ENTRY via Worker API
async function confirmEntry() {
    const gameIdRaw = document.getElementById('gameId').value.trim();
    const whatsappOptOut = document.getElementById('whatsappOptOut');
    const whatsappInput = document.getElementById('whatsappNumber');
    
    // Validate Game ID - EXACTLY 10 digits
    let gameId;
    try {
        gameId = normalizeGameId(gameIdRaw);
    } catch (error) {
        showToast('❌ ID DE JOGO INVÁLIDO! Digite exatamente 10 dígitos', 'error');
        return;
    }
    
    // Get WhatsApp number - clean format +55XXXXXXXXXXX (no spaces)
    let whatsappNumber = 'N/A';
    const isOptOutChecked = whatsappOptOut ? whatsappOptOut.checked : false;
    if (!isOptOutChecked) {
        // User wants to provide WhatsApp
        const rawNumber = whatsappInput.value.replace(/\D/g, '');
        
        if (!isValidWhatsApp(rawNumber)) {
            showToast('❌ WHATSAPP INVÁLIDO! Digite 10-11 dígitos (ex: 11999887766)', 'error');
            return;
        }
        
        // Format as +55XXXXXXXXXXX
        whatsappNumber = '+55' + rawNumber;
    }
    
    if (selectedNumbers.length < 5 || selectedNumbers.length > 20) {
        showToast('❌ SELECIONE ENTRE 5 NÚMEROS!', 'error');
        return;
    }

    const platform = getSelectedPlatform();
    if (!platform) {
        showToast('❌ Selecione POPN1 antes de confirmar', 'error');
        return;
    }
    
    console.log('══════════════════════════════════════');
    console.log('🎯 STARTING ENTRY VALIDATION');
    console.log('   Game ID:', gameId);
    console.log('   WhatsApp:', whatsappNumber);
    console.log('   Platform:', platform);
    console.log('   Numbers:', selectedNumbers);
    console.log('══════════════════════════════════════');
    
    closeUserInfoPopup();
    showToast('🔍 VERIFICANDO...', 'checking');
    
    try {
        const drawDate = getDrawDate();
        const numerosFormatted = selectedNumbers.map(n => n.toString().padStart(2, '0')).join(', ');
        
        console.log('Draw date calculated:', drawDate);
        
        // ✅ SECURE: Submit via Worker API
        const year = drawDate.getFullYear();
        const month = String(drawDate.getMonth() + 1).padStart(2, '0');
        const day = String(drawDate.getDate()).padStart(2, '0');
        const drawDateStr = `${year}-${month}-${day}`;
        
        const concurso = calculateConcurso(drawDate);
        
        const response = await fetch(`${API_BASE_URL}/api/tickets/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                platform: platform,
                gameId: gameId,
                whatsappNumber: whatsappNumber,
                numerosEscolhidos: numerosFormatted,
                drawDate: drawDateStr,
                concurso: concurso
            })
        });
        
        const saveResult = await response.json();
        
        if (!response.ok || !saveResult.success) {
            throw new Error(saveResult.error || 'Erro ao salvar');
        }
        
        const bilheteNumber = saveResult.bilheteNumber;
        
        console.log(`✅ SAVED! Bilhete number: ${bilheteNumber}`);
        
        // Telegram notification sent automatically by Worker
        
        // Redirect to bilhete page
        const spTime = getBrazilTime();
        
        const generateTime = formatBrazilDateTime(spTime, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const ticketDateDisplay = formatBrazilDateTime(drawDate, {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        
        const formattedNumbers = selectedNumbers.map(n => n.toString().padStart(2, '0')).join(',');
        
        const params = new URLSearchParams({
            gameId: gameId,
            whatsapp: whatsappNumber,
            numbers: formattedNumbers,
            time: generateTime,
            date: ticketDateDisplay,
            bilhete: bilheteNumber,
            concurso: concurso,
            platform: platform
        });
        
        hideToast();
        window.location.href = `bilhete.html?${params.toString()}`;
        
    } catch (error) {
        console.error('Error:', error);
        hideToast();
        
        // Show actual error message from server or network error
        const errorMsg = error.message || 'Erro ao salvar! Tente novamente!';
        showToast('❌ ' + errorMsg, 'error');
    }
}

// Toast notification
function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    
    if (type === 'error') {
        toast.classList.add('error');
        setTimeout(() => {
            toast.className = 'toast';
        }, 15000);
    } else if (type === 'checking') {
        toast.classList.add('checking');
    } else {
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }
}

// Hide toast manually
function hideToast() {
    const toast = document.getElementById('toast');
    toast.className = 'toast';
}

// Countdown timer - BRAZIL TIMEZONE + SKIP SUNDAY
// ✅ CORRECT - Force Brazil timezone
function initCountdown() {
    function updateCountdown() {
        const spTime = getBrazilTime(); // Use corrected Brazil time function
        
        const schedule = getCurrentDrawSchedule();
        
        // Build target time with explicit Brazil timezone
        const drawDateStr = getBrazilDateString(schedule.drawDate);
        const targetTime = new Date(`${drawDateStr}T${schedule.drawHour.toString().padStart(2, '0')}:00:00-03:00`);
        
        const diff = targetTime - spTime;
        
        if (diff < 0) {
            console.warn('Countdown negative, recalculating...');
            // Force page reload to recalculate next draw
            setTimeout(() => {
                initCountdown(); // Restart countdown
            }, 1000);
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
            countdownEl.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            const minutesLeft = Math.floor(diff / (1000 * 60));
            if (minutesLeft <= 15) {
                countdownEl.classList.add('pulse');
            } else {
                countdownEl.classList.remove('pulse');
            }
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function bindUiEvents() {
    const howItWorksBtn = document.getElementById('ctaHowItWorksBtn');
    if (howItWorksBtn) {
        howItWorksBtn.addEventListener('click', scrollToVerticalVideo);
    }

    const clearBtn = document.getElementById('btnClearNumbers');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearNumbers);
    }

    const surpriseBtn = document.getElementById('btnSurpresinha');
    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', surpresinha);
    }

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', showUserInfoPopup);
    }

    const closePopupBtn = document.getElementById('closePopupBtn');
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', closeUserInfoPopup);
    }

    const confirmBtn = document.getElementById('btnConfirmEntry');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmEntry);
    }
}

// Scroll to selection
function scrollToSelection() {
    document.getElementById('selection').scrollIntoView({ behavior: 'smooth' });
}

// Scroll to vertical video section
function scrollToVerticalVideo() {
    const target = document.getElementById('verticalVideoSection');
    if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
    }
}

// Update draw date display with CONCURSO NUMBER
function updateDrawDateDisplay() {
    const drawDate = getDrawDate();
    const drawHour = getDrawHour();
    const concurso = calculateConcurso(drawDate);
    
    const day = drawDate.getDate().toString().padStart(2, '0');
    const month = (drawDate.getMonth() + 1).toString().padStart(2, '0');
    const year = drawDate.getFullYear();
    
    const formattedDate = `${day}/${month}/${year} ${drawHour.toString().padStart(2, '0')}h`;
    
    document.getElementById('drawDate').textContent = formattedDate;
    document.getElementById('contestNumber').textContent = concurso;
}

// ✅ DevTools protection (with Q+2 override)
(() => {
  const DETECT_INTERVAL_MS = 600;
  // DEV PROTECTION DISABLED
})();

// ✅ VLD Ticket Consultation Functionality (uses Google Sheets with blurred data)
(function() {
  const ENTRIES_URL = 'https://docs.google.com/spreadsheets/d/1OttNYHiecAuGG6IRX7lW6lkG5ciEcL8gp3g6lNrN9H8/export?format=csv&gid=0';
  
  let allEntries = [], filteredEntries = [];
  let currentFilter = 'all', searchTerm = '';
  let currentPage = 1, perPage = 10;

  function detectDelimiter(headerLine) {
    const counts = {
      ',': (headerLine.match(/,/g) || []).length,
      ';': (headerLine.match(/;/g) || []).length,
      '\t': (headerLine.match(/\t/g) || []).length,
      '|': (headerLine.match(/\|/g) || []).length,
    };
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0] || ',';
  }

  function parseCSVLine(line, delimiter=',') {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === delimiter && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseBrDateTime(str) {
    if (!str) return null;
    try {
      const [datePart, timePart='00:00:00'] = str.trim().split(' ');
      const [d,m,y] = datePart.split(/[\/\-]/).map(Number);
      const [hh=0,mm=0,ss=0] = timePart.split(':').map(Number);
      if (!d || !m || !y) return null;
      return new Date(Date.UTC(y, m-1, d, hh + 3, mm, ss));
    } catch { return null; }
  }

  function formatBr(dt) {
    if (!dt || isNaN(dt.getTime())) return null;
    return dt.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Sao_Paulo'
    });
  }

  function getBallColorClass(num){ return 'ball-color-' + (num % 10); }
  function normalizeStatus(status){
    const up = status.toUpperCase();
    if (up === 'VALID' || up === 'VALIDADO') return 'valid';
    if (up === 'INVALID' || up === 'INVÁLIDO') return 'invalid';
    return 'pending';
  }
  function maskWhatsApp(w){
    if (!w) return '****';
    const digits = w.replace(/\D/g,'');
    if (digits.length < 4) return '****';
    return '***' + digits.slice(-4);
  }

  async function fetchEntries(){
    try{
      // Append cache-busting parameter with & since URL already has query params
      const url = `${ENTRIES_URL}&t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const csv = await res.text();
      
      // Check if we got HTML instead of CSV (Google Sheets might return login page)
      if (csv.trim().startsWith('<!DOCTYPE') || csv.trim().startsWith('<html')) {
        throw new Error('Received HTML instead of CSV. Sheet may not be publicly accessible.');
      }
      const lines = csv.split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) throw new Error('CSV vazio');

      const delimiter = detectDelimiter(lines[0]);
      allEntries = [];

      for(let i=1;i<lines.length;i++){
        const row = parseCSVLine(lines[i], delimiter);
        if(row.length < 9) continue;

        const timestampRaw = row[0]||'';
        const platform = row[1]||'POPN1';
        const gameId = row[2]||'';
        const whatsappRaw = row[3]||'';
        const numbers = (row[4]||'').split(/[,;|\t]/).map(n=>parseInt(n.trim())).filter(n=>!isNaN(n));
        const drawDate = row[5]||'';
        const contest = row[6]||'';
        const ticketNumber = row[7]||'';
        const status = (row[8]||'PENDING').trim().toUpperCase();

        const parsedDate = parseBrDateTime(timestampRaw);

        allEntries.push({
          timestamp: timestampRaw,
          parsedDate,
          platform,
          gameId,
          bilheteNumber: ticketNumber,
          numbers,
          drawDate,
          contest,
          whatsapp: whatsappRaw,
          whatsappMasked: maskWhatsApp(whatsappRaw),
          status
        });
      }

      allEntries.sort((a,b)=>{
        const ta = a.parsedDate ? a.parsedDate.getTime() : 0;
        const tb = b.parsedDate ? b.parsedDate.getTime() : 0;
        return tb - ta;
      });

      updateStats(); applyFilters(); updateLastUpdate();
      document.getElementById('loadingState').style.display='none';
      document.getElementById('entriesGrid').style.display='grid';
      document.getElementById('paginationControls').style.display='flex';
    }catch(err){
      console.error(err);
      document.getElementById('loadingState').innerHTML =
        `<div style="background:#fff1f2;color:#b91c1c;padding:23px;border-radius:12px;text-align:center;">
           ⚠️ Não foi possível carregar os dados agora.<br>
           <strong>Tente novamente em alguns minutos.</strong><br><br>
           Se o problema persistir, entre em contato conosco pelo WhatsApp:<br>
           <a href="https://wa.popsorte.vip" target="_blank" style="color:#dc2626;font-weight:bold;">💬 Falar com Suporte</a>
         </div>`;
    }
  }

  function updateStats(){
    const total=allEntries.length;
    const valid=allEntries.filter(e=>e.status==='VALID'||e.status==='VALIDADO').length;
    const invalid=allEntries.filter(e=>e.status==='INVALID'||e.status==='INVÁLIDO').length;
    const pending=allEntries.filter(e=>!['VALID','VALIDADO','INVALID','INVÁLIDO'].includes(e.status)).length;
    document.getElementById('totalCount').textContent=total;
    document.getElementById('validCount').textContent=valid;
    document.getElementById('invalidCount').textContent=invalid;
    document.getElementById('pendingCount').textContent=pending;
  }
  function updateLastUpdate(){
    document.getElementById('lastUpdate').textContent = formatBrazilDateTime(getBrazilTime());
  }
  function applyFilters(){
    filteredEntries = allEntries;
    if(currentFilter!=='all'){
      filteredEntries = filteredEntries.filter(e=>normalizeStatus(e.status)===currentFilter);
    }
    if(searchTerm){
      const term = searchTerm.toLowerCase();
      filteredEntries = filteredEntries.filter(e =>
        e.gameId.toLowerCase().includes(term) ||
        (e.whatsapp || '').toLowerCase().includes(term)
      );
    }
    currentPage=1;
    renderEntries();
  }
  function renderEntries(){
    const grid = document.getElementById('entriesGrid');
    grid.innerHTML = '';

    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const pageEntries = filteredEntries.slice(start, end);

    if (pageEntries.length === 0) {
      grid.innerHTML = '<div class="empty-state">🔍 Nenhuma participação encontrada.<br>Tente ajustar filtros ou busca.</div>';
      updatePagination();
      return;
    }

    pageEntries.forEach(entry => {
      const statusClass = normalizeStatus(entry.status);
      const statusLabel = statusClass === 'valid' ? 'VÁLIDO' :
                         statusClass === 'invalid' ? 'INVÁLIDO' :
                         'EM VERIFICAÇÃO';

      // Format numbers with ball styling
      const numsHTML = entry.numbers.map(num =>
        `<div class="number-badge ${getBallColorClass(num)}">
           <span class="number-text">${num.toString().padStart(2,'0')}</span>
         </div>`
      ).join('');

      // Format timestamp
      const formattedTime = formatBr(entry.parsedDate) || entry.timestamp || '—';

      // Create card element with neumorphism classes
      const card = document.createElement('div');
      card.className = `entry-card ${statusClass} neuro-card`;

      // Add data attributes for enhanced neumorphism effects
      card.setAttribute('data-status', statusClass);

      card.innerHTML = `
        <div class="entry-top">
          <div class="status-badge ${statusClass}">${statusLabel}</div>
          <div class="entry-id-block">
            <div class="entry-id-title">ID: ${entry.gameId}</div>
            <div class="entry-id-sub">${entry.bilheteNumber || '—'}</div>
          </div>
        </div>

        <div class="entry-meta neuro-meta">
          <div class="meta-left">
            <div class="detail-item">
              📱 <strong>${entry.whatsappMasked}</strong>
            </div>
            <div class="detail-item">
              🏢 <strong>${entry.platform || 'POPN1'}</strong>
            </div>
          </div>
          <div class="meta-right">
            <div class="detail-item">
              🎰 Concurso <strong>${entry.contest}</strong>
            </div>
            <div class="detail-item">
              📅 <strong>${entry.drawDate}</strong>
            </div>
          </div>
        </div>

        <div class="numbers-display neuro-numbers">
          ${numsHTML}
        </div>

        <div class="entry-timestamp neuro-timestamp">
          🕒 ${formattedTime}
        </div>
      `;

      grid.appendChild(card);
    });

    updatePagination();
  }
  function updatePagination(){
    const totalPages=Math.ceil(filteredEntries.length/perPage);
    document.getElementById('pageInfo').textContent=`Página ${currentPage} de ${totalPages} (${filteredEntries.length} resultados)`;
    document.getElementById('prevBtn').disabled=currentPage===1;
    document.getElementById('nextBtn').disabled=currentPage>=totalPages;
  }

  if (document.querySelector('.vld-section')) {
    document.querySelectorAll('.filter-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter=btn.dataset.filter;
        applyFilters();
      });
    });
    document.getElementById('searchBox').addEventListener('input',e=>{
      searchTerm=e.target.value;
      applyFilters();
    });
    document.getElementById('prevBtn').addEventListener('click',()=>{
      if(currentPage>1){currentPage--; renderEntries();}
    });
    document.getElementById('nextBtn').addEventListener('click',()=>{
      const totalPages=Math.ceil(filteredEntries.length/perPage);
      if(currentPage<totalPages){currentPage++; renderEntries();}
    });
    document.getElementById('perPageSelect').addEventListener('change',e=>{
      perPage=parseInt(e.target.value); currentPage=1; renderEntries();
    });

    fetchEntries();
    setInterval(fetchEntries,30000);
  }
})();

// Mobile Bottom Navigation
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    const navItems = document.querySelectorAll('.mobile-nav .nav-item');
    const sections = {
      'home': null, // home is default, hide others
      'rules': document.querySelector('.rules-section'),
      'search': document.querySelector('.vld-section'),
      'help': document.getElementById('verticalVideoSection'),
      'popluz': document.querySelector('.popluz-section')
    };

    // Function to show section
    function showSection(target) {
      // Hide all sections
      Object.values(sections).forEach(section => {
        if (section) section.style.display = 'none';
      });

      // Hide home-specific sections
      document.querySelector('.hero-section').style.display = 'none';
      document.querySelector('.selection-section').style.display = 'none';

      // Scroll to top for smooth transition
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (target === 'home') {
        // Show home sections
        document.querySelector('.hero-section').style.display = 'block';
        document.querySelector('.selection-section').style.display = 'block';
      } else {
        // Show target section
        if (sections[target]) {
          sections[target].style.display = 'block';
        }
      }

      // Special handling for search
      if (target === 'search') {
        setTimeout(() => {
          const searchBox = document.getElementById('searchBox');
          if (searchBox) {
            searchBox.focus();
            searchBox.classList.add('highlighted');
            setTimeout(() => {
              searchBox.classList.remove('highlighted');
            }, 2000);
          }
        }, 100);
      }
    }

    navItems.forEach(item => {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        const target = this.getAttribute('data-target');

        showSection(target);

        navItems.forEach(nav => nav.classList.remove('active'));
        this.classList.add('active');
      });
    });

    // Show home by default
    showSection('home');
  });
})();

// POPLUZ Slider and Countdown
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    const slider = document.getElementById('popluzSlider');
    const dotsContainer = document.getElementById('popluzDots');
    const countdownElement = document.querySelector('.popluz-coming-soon');
    
    if (!slider || !dotsContainer) return;
    
    const slides = slider.querySelectorAll('.popluz-slide');
    const totalSlides = slides.length;
    let currentSlide = 0;

    // Create dots
    slides.forEach((_, index) => {
      const dot = document.createElement('div');
      dot.className = 'dot';
      if (index === 0) dot.classList.add('active');
      dot.addEventListener('click', () => goToSlide(index));
      dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll('.dot');

    function goToSlide(index) {
      currentSlide = index;
      slider.style.transform = `translateX(-${currentSlide * 100}%)`;
      updateDots();
    }

    function updateDots() {
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
      });
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % totalSlides;
      goToSlide(currentSlide);
    }

    // Auto slide every 4 seconds
    setInterval(nextSlide, 4000);

        // Countdown to January 6, 2026, Brazil time (UTC-3) at 00:01
        function updateCountdown() {
            const brazilTime = getBrazilTime();
            const target = new Date('2026-01-06T00:01:00-03:00'); // Jan 6, 2026 00:01 Brazil
            const diff = target - brazilTime;
      
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        document.getElementById('days').textContent = days.toString().padStart(2, '0');
        document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
        document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
      } else {
        document.getElementById('countdownDisplay').innerHTML = '<div class="launched">🚀 LANÇADO!</div>';
      }
    }

    // Update countdown every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
  });
})();

// Anti-debugging protection
(function() {
  let devtoolsOpen = false;
  let secretKeyPressed = false;
  let secretKeyTimer;
  let qPressed = false;
  let twoPressed = false;

  // Function to show toast
  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      padding: 30px 60px;
      border-radius: 16px;
      font-weight: 900;
      font-size: 24px;
      z-index: 10001;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5), 0 0 20px rgba(16, 185, 129, 0.4);
      border: 3px solid rgba(255,255,255,0.3);
      animation: zoomInOut 2.5s ease-in-out;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2500);
  }

  // Add toast animations to CSS if not present
  if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes zoomInOut {
        0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
        15% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        85% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // Block right-click
  document.addEventListener('contextmenu', function(e) {
    if (!devtoolsOpen) {
      e.preventDefault();
    }
  });

  // Block keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Secret key: hold q + 2 for 2 seconds
    if (e.key === 'q' || e.key === 'Q') {
      qPressed = true;
    }
    if (e.key === '2') {
      twoPressed = true;
    }

    if (qPressed && twoPressed && !secretKeyPressed) {
      secretKeyPressed = true;
      secretKeyTimer = setTimeout(() => {
        devtoolsOpen = true;
        showToast('OK BOSKU GAS');
        qPressed = false;
        twoPressed = false;
        secretKeyPressed = false;
      }, 2000);
    }

    // Block dev tool shortcuts if not unlocked
    if (!devtoolsOpen) {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'U') ||
        (e.ctrlKey && e.key === 'S')
      ) {
        e.preventDefault();
        return false;
      }
    }
  });

  document.addEventListener('keyup', function(e) {
    if (e.key === 'q' || e.key === 'Q') {
      qPressed = false;
    }
    if (e.key === '2') {
      twoPressed = false;
    }

    if (secretKeyPressed && (!qPressed || !twoPressed)) {
      clearTimeout(secretKeyTimer);
      secretKeyPressed = false;
    }
  });

  // Detect dev tools open (basic detection)
  let threshold = 160;
  setInterval(() => {
    if (!devtoolsOpen && window.outerHeight - window.innerHeight > threshold || window.outerWidth - window.innerWidth > threshold) {
      // Dev tools might be open, but don't block unless shortcuts are used
    }
  }, 500);
})();