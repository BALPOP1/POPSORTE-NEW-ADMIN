const RECHARGE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1c6gnCngs2wFOvVayd5XpM9D3LOlKUxtSjl7gfszXcMg/export?format=csv&gid=0';

const BRT_OFFSET_HOURS = 3;
const BRT_OFFSET_MS = BRT_OFFSET_HOURS * 60 * 60 * 1000;

function brtFields(date) {
    const shifted = new Date(date.getTime() - BRT_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(), // 0-based
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(), // 0=Sunday
    };
}

function makeDateFromBrt(year, month, day, hour = 0, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month, day, hour + BRT_OFFSET_HOURS, minute, second));
}

function startOfDayBrt(date) {
    const f = brtFields(date);
    return makeDateFromBrt(f.year, f.month, f.day, 0, 0, 0);
}

function addDaysBrt(date, n) {
    const start = startOfDayBrt(date);
    return new Date(start.getTime() + n * 24 * 60 * 60 * 1000);
}

class RechargeValidator {
    constructor() {
        this.recharges = [];
        this.validatedEntries = [];
        this.lastFetchTime = null;

        // No-draw holidays (extend as needed)
        this.noDrawHolidays = [
            '12-25', // Dec 25
            '01-01'  // Jan 1
        ];
    }

    async fetchRechargeData() {
        const response = await fetch(RECHARGE_SHEET_CSV_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch recharge data from Google Sheets');
        }
        const csvText = await response.text();
        this.parseRechargeCSV(csvText);
        this.lastFetchTime = new Date();
        return this.recharges;
    }

    // ---------- Draw / cutoff helpers (BRT, merged windows) ----------

    isNoDrawDay(dateObj) {
        const f = brtFields(dateObj);
        if (f.weekday === 0) return true; // Sunday
        const m = String(f.month + 1).padStart(2, '0');
        const d = String(f.day).padStart(2, '0');
        const key = `${m}-${d}`;
        if (this.noDrawHolidays.includes(key)) return true;
        return false;
    }

    getCutoffTime(dateObj) {
        const f = brtFields(dateObj);
        const m = f.month + 1;
        const d = f.day;
        if ((m === 12 && d === 24) || (m === 12 && d === 31)) {
            return { hour: 16, minute: 0, second: 0 };
        }
        return { hour: 20, minute: 0, second: 0 };
    }

    buildCutoffDateTime(dateObj) {
        const f = brtFields(dateObj);
        const { hour, minute, second } = this.getCutoffTime(dateObj);
        return makeDateFromBrt(f.year, f.month, f.day, hour, minute, second);
    }

    // Find the first draw day whose cutoff is > given time
    firstDrawDayAfter(timeObj) {
        let probe = startOfDayBrt(timeObj);
        for (let i = 0; i < 60; i++) {
            if (!this.isNoDrawDay(probe)) {
                const cutoff = this.buildCutoffDateTime(probe);
                if (cutoff > timeObj) {
                    return startOfDayBrt(probe);
                }
            }
            probe = addDaysBrt(probe, 1);
        }
        return null;
    }

    // Find the draw day for a ticket time T: first draw day with cutoff >= ticket timestamp (Rule B)
    ticketDrawDay(ticketTime) {
        let probe = startOfDayBrt(ticketTime);
        for (let i = 0; i < 60; i++) { // safety horizon
            if (!this.isNoDrawDay(probe)) {
                const cutoff = this.buildCutoffDateTime(probe);
                if (cutoff >= ticketTime) {
                    return {
                        day: startOfDayBrt(probe),
                        cutoff
                    };
                }
            }
            probe = addDaysBrt(probe, 1);
        }
        return null;
    }

    // Given a recharge time R, find EligibleDraw1 (hari recharge) dan EligibleDraw2 (hari draw berikutnya)
    computeEligibleDraws(rechargeTimeObj) {
        if (!rechargeTimeObj) return null;

        // Eligible 1: hari recharge (jika no-draw, maju ke hari draw berikutnya)
        let eligible1Day = startOfDayBrt(rechargeTimeObj);
        for (let i = 0; i < 60 && this.isNoDrawDay(eligible1Day); i++) {
            eligible1Day = addDaysBrt(eligible1Day, 1);
        }
        const eligible1Cutoff = this.buildCutoffDateTime(eligible1Day);

        // Eligible 2: hari draw setelah eligible1 (skip no-draw)
        let eligible2Day = addDaysBrt(eligible1Day, 1);
        for (let i = 0; i < 60 && this.isNoDrawDay(eligible2Day); i++) {
            eligible2Day = addDaysBrt(eligible2Day, 1);
        }
        const eligible2Cutoff = this.buildCutoffDateTime(eligible2Day);

        return {
            eligible1: { day: eligible1Day, cutoff: eligible1Cutoff },
            eligible2: { day: eligible2Day, cutoff: eligible2Cutoff }
        };
    }

    // ---------- CSV parsing ----------
    parseRechargeCSV(csvText) {
        const lines = csvText.split('\n');
        const recharges = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = this.parseCSVLine(line);
            if (values.length < 9) continue;
            if (values[6] !== '充值') continue; // only recharge rows

            const recharge = {
                gameId: values[0],
                rechargeId: values[1],
                rechargeTime: values[5],
                rechargeAmount: parseFloat(values[8]),
                rechargeStatus: 'VALID',
                rechargeSource: values[7] || '三方'
            };
            recharge.rechargeTimeObj = this.parseBrazilTime(recharge.rechargeTime);
            recharges.push(recharge);
        }
        this.recharges = recharges;
        return recharges;
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }

    // --------- build Date in BRT wall time, avoid double offsets ---------
    parseBrazilTime(timeString) {
        try {
            if (!timeString || typeof timeString !== 'string') return null;

            // If the string already has an explicit timezone, trust it.
            if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(timeString.trim())) {
                const dateObj = new Date(timeString);
                return isNaN(dateObj.getTime()) ? null : dateObj;
            }

            // Expected format: dd/mm/yyyy HH:MM(:SS)?
            const [datePart, timePartRaw = '00:00:00'] = timeString.split(' ');
            const [d, m, y] = datePart.split('/').map(v => parseInt(v, 10));
            if (![d, m, y].every(Number.isFinite)) return null;

            const [hh = 0, mm = 0, ss = 0] = timePartRaw.split(':').map(v => parseInt(v, 10));
            return makeDateFromBrt(y, m - 1, d, hh, mm, ss);
        } catch {
            return null;
        }
    }

    // --------- build Date in BRT wall time, avoid double offsets ---------
    parseTicketTime(timeString) {
        try {
            if (!timeString || typeof timeString !== 'string') return null;

            // If the string already has an explicit timezone, trust it.
            if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(timeString.trim())) {
                const dateObj = new Date(timeString);
                return isNaN(dateObj.getTime()) ? null : dateObj;
            }

            // Expected format: dd/mm/yyyy HH:MM(:SS)?
            const [datePart, timePartRaw = '00:00:00'] = timeString.split(' ');
            const [d, m, y] = datePart.split('/').map(v => parseInt(v, 10));
            if (![d, m, y].every(Number.isFinite)) return null;

            const [hh = 0, mm = 0, ss = 0] = timePartRaw.split(':').map(v => parseInt(v, 10));
            return makeDateFromBrt(y, m - 1, d, hh, mm, ss);
        } catch {
            return null;
        }
    }

    // ---------- Core validation (Rule B, merged windows) ----------
    validateEntries(entries) {
        if (this.recharges.length === 0) {
            console.warn('No recharge data loaded. Upload recharge CSV first.');
            return entries.map(entry => ({
                ...entry,
                validity: 'UNKNOWN',
                invalidReasonCode: 'NO_RECHARGE_DATA',
                boundRechargeId: null
            }));
        }

        // Group recharges by user and sort by time
        const rechargesByGameId = {};
        this.recharges.forEach(r => {
            if (!rechargesByGameId[r.gameId]) rechargesByGameId[r.gameId] = [];
            rechargesByGameId[r.gameId].push(r);
        });
        Object.values(rechargesByGameId).forEach(list =>
            list.sort((a, b) => (a.rechargeTimeObj?.getTime() || 0) - (b.rechargeTimeObj?.getTime() || 0))
        );

        // Prep tickets by user
        const entriesByGameId = {};
        entries.forEach(e => {
            if (!entriesByGameId[e.gameId]) entriesByGameId[e.gameId] = [];
            e.ticketTimeObj = this.parseTicketTime(e.registrationDateTime);
            entriesByGameId[e.gameId].push(e);
        });
        Object.values(entriesByGameId).forEach(list =>
            list.sort((a, b) => (a.ticketTimeObj?.getTime() || 0) - (b.ticketTimeObj?.getTime() || 0))
        );

        const validated = [];

        Object.keys(entriesByGameId).forEach(gameId => {
            const tickets = entriesByGameId[gameId];
            const userRecharges = rechargesByGameId[gameId] || [];
            const consumed = new Set();

            // Precompute windows per recharge
            const rechargeWindows = userRecharges.map(r => ({
                recharge: r,
                windows: this.computeEligibleDraws(r.rechargeTimeObj)
            }));

            tickets.forEach(ticket => {
                let validity = 'INVALID';
                let reason = 'NO_ELIGIBLE_RECHARGE';
                let bound = null;
                let cutoffFlag = false;

                if (!ticket.ticketTimeObj) {
                    validity = 'INVALID';
                    reason = 'INVALID_TICKET_TIME';
                    validated.push(this._result(ticket, validity, reason, bound, cutoffFlag));
                    return;
                }

                const t = ticket.ticketTimeObj;
                const drawInfo = this.ticketDrawDay(t);
                if (!drawInfo) {
                    validity = 'INVALID';
                    reason = 'NO_ELIGIBLE_RECHARGE';
                    validated.push(this._result(ticket, validity, reason, bound, cutoffFlag));
                    return;
                }
                const ticketDrawDay = drawInfo.day;

                // Determine if there exists ANY recharge before this ticket
                const hasRechargeBefore = userRecharges.some(r => r.rechargeTimeObj && t > r.rechargeTimeObj);

                let foundMatch = false;
                let expiredCandidate = false;
                let consumedCandidate = false;

                for (const { recharge, windows } of rechargeWindows) {
                    if (!windows) continue;
                    const rt = recharge.rechargeTimeObj;
                    if (!rt) continue;

                    const sameDayBrt = (a, b) => {
                        const fa = brtFields(a);
                        const fb = brtFields(b);
                        return fa.year === fb.year && fa.month === fb.month && fa.day === fb.day;
                    };

                    const isEligible1 = sameDayBrt(ticketDrawDay, windows.eligible1.day);
                    const isEligible2 = sameDayBrt(ticketDrawDay, windows.eligible2.day);

                    // Ticket must be after recharge time
                    if (t <= rt) {
                        continue; // do not mark before-recharge here; handled after loop
                    }

                    if (!(isEligible1 || isEligible2)) {
                        if (ticketDrawDay > windows.eligible2.day) expiredCandidate = true;
                        continue;
                    }

                    if (consumed.has(recharge.rechargeId)) {
                        consumedCandidate = true;
                        continue;
                    }

                    // Passed all checks
                    foundMatch = true;
                    bound = recharge;
                    validity = recharge.rechargeStatus === 'VALID' ? 'VALID' : 'INVALID';
                    reason = recharge.rechargeStatus === 'VALID' ? null : 'RECHARGE_INVALIDATED';
                    consumed.add(recharge.rechargeId);
                    if (isEligible2) cutoffFlag = true; // using second eligible day
                    break;
                }

                if (!foundMatch) {
                    if (!hasRechargeBefore) {
                        reason = 'INVALID_TICKET_BEFORE_RECHARGE';
                    } else if (expiredCandidate) {
                        reason = 'INVALID_RECHARGE_WINDOW_EXPIRED';
                    } else if (consumedCandidate) {
                        reason = 'INVALID_NOT_FIRST_TICKET_AFTER_RECHARGE';
                    } else {
                        reason = 'NO_ELIGIBLE_RECHARGE';
                    }
                }

                validated.push(this._result(ticket, validity, reason, bound, cutoffFlag));
            });
        });

        this.validatedEntries = validated;
        return validated;
    }

    _result(ticket, validity, reason, bound, cutoffFlag) {
        return {
            ...ticket,
            validity,
            invalidReasonCode: reason,
            boundRechargeId: bound?.rechargeId || null,
            boundRechargeTime: bound?.rechargeTime || null,
            boundRechargeAmount: bound?.rechargeAmount || null,
            cutoffFlag
        };
    }

    getReasonCodeText(code) {
        const reasons = {
            'NO_RECHARGE_DATA': 'No recharge data uploaded',
            'NO_ELIGIBLE_RECHARGE': 'No recharge window covers this ticket',
            'INVALID_TICKET_BEFORE_RECHARGE': 'Ticket time is before or equal to recharge time',
            'INVALID_NOT_FIRST_TICKET_AFTER_RECHARGE': 'Recharge already consumed by a previous ticket',
            'INVALID_RECHARGE_WINDOW_EXPIRED': 'Recharge expired after its second eligible draw day',
            'RECHARGE_INVALIDATED': 'Bound recharge was invalidated',
            'INVALID_TICKET_TIME': 'Ticket registration time could not be parsed'
        };
        return reasons[code] || 'Unknown reason';
    }

    getStatistics() {
        const validCount = this.validatedEntries.filter(e => e.validity === 'VALID').length;
        const invalidCount = this.validatedEntries.filter(e => e.validity === 'INVALID').length;
        const unknownCount = this.validatedEntries.filter(e => e.validity === 'UNKNOWN').length;
        const cutoffFlagCount = this.validatedEntries.filter(e => e.cutoffFlag).length;

        const reasonCounts = {};
        this.validatedEntries.forEach(e => {
            if (e.invalidReasonCode) {
                reasonCounts[e.invalidReasonCode] = (reasonCounts[e.invalidReasonCode] || 0) + 1;
            }
        });

        return {
            totalRecharges: this.recharges.length,
            validTickets: validCount,
            invalidTickets: invalidCount,
            unknownTickets: unknownCount,
            cutoffShiftCases: cutoffFlagCount,
            invalidReasons: reasonCounts
        };
    }

    getValidatedEntries() {
        return this.validatedEntries;
    }

    getRecharges() {
        return this.recharges;
    }
}

// Global instance
const rechargeValidator = new RechargeValidator();
