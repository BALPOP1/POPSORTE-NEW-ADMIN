/**
 * POP-SORTE Admin Dashboard - Recharge Validator Module
 * 
 * This module handles ticket validation against recharge data.
 * 
 * Validation Rules:
 * 1. Ticket must be created AFTER recharge timestamp
 * 2. Ticket must fall within eligible draw windows (same day or next draw day)
 * 3. Each recharge can only be used once (first ticket after recharge)
 * 4. Cutoff time: 20:00 BRT (16:00 on Dec 24/31)
 * 5. No draws on Sundays and holidays (Dec 25, Jan 1)
 * 
 * Dependencies: admin-core.js (AdminCore), data-fetcher.js (DataFetcher)
 */

// ============================================
// Recharge Validator Module
// ============================================
window.RechargeValidator = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    
    /**
     * Default cutoff hour for same-day draws (20:00 BRT)
     */
    const DEFAULT_CUTOFF_HOUR = 20;
    
    /**
     * Early cutoff hour for special days (Dec 24, Dec 31)
     */
    const EARLY_CUTOFF_HOUR = 16;
    
    /**
     * Validation result statuses
     */
    const ValidationStatus = {
        VALID: 'VALID',
        INVALID: 'INVALID',
        UNKNOWN: 'UNKNOWN',
        CUTOFF: 'CUTOFF'
    };

    // ============================================
    // Draw Calendar Helpers
    // ============================================
    
    /**
     * Check if a date is a no-draw day (Sunday, Dec 25, Jan 1)
     * @param {Date} date - Date to check
     * @returns {boolean} True if no draw on this day
     */
    function isNoDrawDay(date) {
        const month = date.getMonth(); // 0-indexed
        const day = date.getDate();
        const dayOfWeek = date.getDay();
        
        // Sunday
        if (dayOfWeek === 0) return true;
        
        // Christmas (Dec 25)
        if (month === 11 && day === 25) return true;
        
        // New Year (Jan 1)
        if (month === 0 && day === 1) return true;
        
        return false;
    }

    /**
     * Check if a date has early cutoff (Dec 24, Dec 31)
     * @param {Date} date - Date to check
     * @returns {boolean} True if early cutoff applies
     */
    function isEarlyCutoffDay(date) {
        const month = date.getMonth();
        const day = date.getDate();
        
        // Dec 24 or Dec 31
        return month === 11 && (day === 24 || day === 31);
    }

    /**
     * Get cutoff hour for a specific date
     * @param {Date} date - Date to check
     * @returns {number} Cutoff hour (16 or 20)
     */
    function getCutoffHour(date) {
        return isEarlyCutoffDay(date) ? EARLY_CUTOFF_HOUR : DEFAULT_CUTOFF_HOUR;
    }

    /**
     * Get next valid draw date from a given date
     * @param {Date} fromDate - Starting date
     * @returns {Date} Next valid draw date
     */
    function getNextValidDrawDate(fromDate) {
        const probe = new Date(fromDate);
        probe.setHours(0, 0, 0, 0);
        
        // Check up to 14 days ahead
        for (let i = 0; i < 14; i++) {
            if (i > 0) {
                probe.setDate(probe.getDate() + 1);
            }
            
            if (!isNoDrawDay(probe)) {
                return new Date(probe);
            }
        }
        
        throw new Error('No valid draw date found in range');
    }

    /**
     * Get the eligible draw date for a ticket based on registration time
     * @param {Date} registrationTime - When the ticket was registered
     * @returns {Date|null} The draw date this ticket is eligible for, or null if invalid
     */
    function getEligibleDrawDate(registrationTime) {
        // Validate registrationTime is a proper Date object
        if (!registrationTime || !(registrationTime instanceof Date) || isNaN(registrationTime.getTime())) {
            return null;
        }
        
        const regDateStr = AdminCore.getBrazilDateString(registrationTime);
        if (!regDateStr) return null;
        
        const regDate = new Date(`${regDateStr}T00:00:00-03:00`);
        
        // Get registration hour in BRT
        const regHour = registrationTime.getHours();
        const cutoffHour = getCutoffHour(regDate);
        
        if (!isNoDrawDay(regDate) && regHour < cutoffHour) {
            // Before cutoff on a valid draw day - same day draw
            return regDate;
        } else {
            // After cutoff or on a no-draw day - next valid draw
            const nextDay = new Date(regDate);
            nextDay.setDate(nextDay.getDate() + 1);
            return getNextValidDrawDate(nextDay);
        }
    }

    /**
     * Get the 2-day eligibility window for a recharge
     * @param {Date} rechargeTime - When the recharge occurred
     * @returns {Object|null} Object with eligible1 and eligible2 dates, or null if invalid
     */
    function getEligibilityWindow(rechargeTime) {
        // Validate rechargeTime is a proper Date object
        if (!rechargeTime || !(rechargeTime instanceof Date) || isNaN(rechargeTime.getTime())) {
            return null;
        }
        
        // Get first eligible draw date (Day 1)
        const eligible1 = getEligibleDrawDate(rechargeTime);
        if (!eligible1) return null;
        
        // Get second eligible draw date (Day 2) - next valid draw after eligible1
        const dayAfterEligible1 = new Date(eligible1);
        dayAfterEligible1.setDate(dayAfterEligible1.getDate() + 1);
        const eligible2 = getNextValidDrawDate(dayAfterEligible1);
        
        return {
            eligible1: eligible1,
            eligible2: eligible2,
            eligible1Str: AdminCore.getBrazilDateString(eligible1),
            eligible2Str: AdminCore.getBrazilDateString(eligible2)
        };
    }

    // ============================================
    // Recharge Matching
    // ============================================
    
    /**
     * Find the best matching recharge for a ticket
     * @param {Object} ticket - Ticket entry object
     * @param {Object[]} recharges - All recharges for this game ID
     * @param {Object[]} allTickets - All tickets for this game ID (to check usage)
     * @returns {Object|null} Matching recharge with isDay2 flag, or null
     */
    function findMatchingRecharge(ticket, recharges, allTickets) {
        // Validate ticket.parsedDate is a proper Date object
        if (!ticket.parsedDate || !(ticket.parsedDate instanceof Date) || isNaN(ticket.parsedDate.getTime())) {
            return null;
        }
        if (!recharges || recharges.length === 0) {
            return null;
        }
        
        const ticketTime = ticket.parsedDate.getTime();
        const ticketDrawDate = ticket.drawDate;
        
        // Parse ticket draw date to normalized format (YYYY-MM-DD)
        let ticketDrawStr = '';
        if (ticketDrawDate) {
            // Remove time part if present
            const datePart = ticketDrawDate.split(' ')[0];
            const parts = datePart.split(/[\/\-]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    // YYYY-MM-DD
                    ticketDrawStr = parts.join('-');
                } else {
                    // DD/MM/YYYY -> YYYY-MM-DD
                    ticketDrawStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
        }
        
        if (!ticketDrawStr) {
            if (isFirstTicket) console.log('❌ Invalid ticket draw date format:', ticketDrawDate);
            return null; // Can't validate without draw date
        }
        
        // Filter recharges that occurred BEFORE ticket creation
        const eligibleRecharges = recharges.filter(r => {
            if (!r.rechargeTime || !(r.rechargeTime instanceof Date) || isNaN(r.rechargeTime.getTime())) return false;
            return r.rechargeTime.getTime() < ticketTime;
        });
        
        if (eligibleRecharges.length === 0) {
            return null; // No recharge before ticket (Scenario 2)
        }
        
        // Sort by time ASCENDING (EARLIEST first)
        eligibleRecharges.sort((a, b) => a.rechargeTime.getTime() - b.rechargeTime.getTime());
        
        // Debug logging
        const isDebugTicket = ticket.ticketNumber && (ticket.ticketNumber.includes('1°') || ticket.ticketNumber === '1° bilhete');
        
        // Try to match with each recharge (earliest first)
        for (const recharge of eligibleRecharges) {
            // Get 2-day eligibility window for this recharge
            const window = getEligibilityWindow(recharge.rechargeTime);
            if (!window) continue;
            
            // Check if ticket's draw date falls within the eligibility window
            let matchType = null;
            if (ticketDrawStr === window.eligible1Str) {
                matchType = 'day1';
            } else if (ticketDrawStr === window.eligible2Str) {
                matchType = 'day2';
            }
            
            if (isDebugTicket) {
                console.log(`   Checking R$${recharge.amount} (${recharge.rechargeTime.toISOString()}):`);
                console.log(`     Eligible1: ${window.eligible1Str} vs Ticket: ${ticketDrawStr} -> ${ticketDrawStr === window.eligible1Str}`);
                console.log(`     Eligible2: ${window.eligible2Str} vs Ticket: ${ticketDrawStr} -> ${ticketDrawStr === window.eligible2Str}`);
            }
            
            // No match with eligibility window
            if (!matchType) {
                continue;
            }
            
            if (isDebugTicket) console.log(`     ✓ Match found on ${matchType.toUpperCase()}! Checking usage...`);
            
            // Check if this recharge is already consumed by a prior ticket
            const priorTickets = allTickets.filter(t => 
                t.ticketNumber !== ticket.ticketNumber &&
                t.parsedDate &&
                t.parsedDate instanceof Date &&
                !isNaN(t.parsedDate.getTime()) &&
                t.parsedDate.getTime() < ticketTime &&
                t.parsedDate.getTime() > recharge.rechargeTime.getTime()
            );
            
            // Check if any prior ticket already claimed this recharge for the same draw
            let rechargeConsumed = false;
            for (const prior of priorTickets) {
                const priorWindow = getEligibilityWindow(recharge.rechargeTime);
                if (!priorWindow) continue;
                
                // Parse prior ticket's draw date
                let priorDrawStr = '';
                if (prior.drawDate) {
                    const datePart = prior.drawDate.split(' ')[0];
                    const priorParts = datePart.split(/[\/\-]/);
                    if (priorParts.length === 3) {
                        if (priorParts[0].length === 4) {
                            priorDrawStr = priorParts.join('-');
                        } else {
                            priorDrawStr = `${priorParts[2]}-${priorParts[1].padStart(2, '0')}-${priorParts[0].padStart(2, '0')}`;
                        }
                    }
                }
                
                // Check if prior ticket used this recharge within its eligibility window
                if (priorDrawStr === priorWindow.eligible1Str || priorDrawStr === priorWindow.eligible2Str) {
                    rechargeConsumed = true;
                    if (isDebugTicket) console.log(`     ❌ Recharge consumed by ${prior.ticketNumber}`);
                    break;
                }
            }
            
            if (!rechargeConsumed) {
                if (isDebugTicket) console.log(`     ✅ AVAILABLE! Using ${matchType.toUpperCase()}`);
                return {
                    ...recharge,
                    isDay2: matchType === 'day2'
                };
            }
        }
        
        if (isDebugTicket) console.log('   ❌ NO MATCH - All recharges consumed or outside window');
        return null;
    }

    // ============================================
    // Ticket Validation
    // ============================================
    
    /**
     * Validate a single ticket against recharge data
     * @param {Object} ticket - Ticket entry object
     * @param {Object[]} rechargesByGameId - Map of game ID to recharges
     * @param {Object[]} ticketsByGameId - Map of game ID to tickets
     * @returns {Object} Validation result
     */
    function validateTicket(ticket, rechargesByGameId, ticketsByGameId) {
        const result = {
            ticket: ticket,
            status: ValidationStatus.UNKNOWN,
            reason: '',
            matchedRecharge: null,
            isDay2: false,
            isCutoff: false
        };
        
        // Get recharges for this game ID (needed for matching regardless of status)
        const gameId = ticket.gameId;
        if (!gameId) {
            result.status = ValidationStatus.INVALID;
            result.reason = 'Missing Game ID';
            return result;
        }
        
        const recharges = rechargesByGameId[gameId] || [];
        const tickets = ticketsByGameId[gameId] || [];
        
        // Check for cutoff (ticket created after 20:00)
        if (ticket.parsedDate && ticket.parsedDate instanceof Date && !isNaN(ticket.parsedDate.getTime())) {
            const regHour = ticket.parsedDate.getHours();
            const dateStr = AdminCore.getBrazilDateString(ticket.parsedDate);
            if (dateStr) {
                const checkDate = new Date(`${dateStr}T12:00:00-03:00`);
                const cutoffHour = getCutoffHour(checkDate);
                
                // If registered after cutoff, mark as cutoff shift
                if (regHour >= cutoffHour) {
                    result.isCutoff = true;
                }
            }
        }
        
        // Check pre-existing status BUT ALSO find recharge for info display
        const existingStatus = (ticket.status || '').toUpperCase();
        const isPreValidated = ['VALID', 'VALIDADO', 'VALIDATED'].includes(existingStatus);
        const isPreInvalid = ['INVALID', 'INVÁLIDO'].includes(existingStatus);
        
        // HARDCORE DEBUG: Log first ticket validation
        const isDebugTicket = ticket.ticketNumber && (ticket.ticketNumber.includes('1°') || ticket.ticketNumber === '1° bilhete');
        if (isDebugTicket) {
            console.log('🔍 DEBUG VALIDATION:', ticket.ticketNumber);
            console.log('   Game ID:', gameId);
            console.log('   Ticket Date:', ticket.parsedDate);
            console.log('   Draw Date (Raw):', ticket.drawDate);
            console.log('   Recharges found:', recharges.length);
            if (recharges.length > 0) {
                console.log('   First Recharge:', {
                    amount: recharges[0].amount,
                    time: recharges[0].rechargeTime,
                    id: recharges[0].rechargeId
                });
            }
        }
        
        // If no recharges, it's invalid regardless (unless pre-validated, but we can't show info)
        if (recharges.length === 0) {
            if (isPreValidated) {
                result.status = ValidationStatus.VALID;
                result.reason = 'Pre-validated (No recharge found)';
                return result;
            }
            result.status = ValidationStatus.INVALID;
            result.reason = 'No recharge found for Game ID';
            return result;
        }
        
        // Try to find matching recharge
        const matchedRecharge = findMatchingRecharge(ticket, recharges, tickets);
        
        if (matchedRecharge) {
            result.matchedRecharge = matchedRecharge;
            result.isDay2 = matchedRecharge.isDay2 || false;
            
            if (result.isDay2) {
                result.reason = `Matched recharge R$${matchedRecharge.amount || '?'} (Day 2 eligibility)`;
            } else {
                result.reason = `Matched recharge R$${matchedRecharge.amount || '?'}`;
            }
            
            // If pre-validated or successfully matched
            if (isPreValidated || !isPreInvalid) {
                result.status = ValidationStatus.VALID;
            } else {
                result.status = ValidationStatus.INVALID;
                result.reason = 'Marked invalid in source data';
            }
            
            if (isFirstTicket) {
                console.log('===== VALIDATION RESULT (FIRST TICKET) =====');
                console.log('Status:', result.status);
                console.log('Matched recharge:', {
                    amount: matchedRecharge.amount,
                    isDay2: result.isDay2,
                    rechargeTime: matchedRecharge.rechargeTime
                });
                console.log('==========================================');
            }
        } else {
            // No match found
            if (isPreValidated) {
                result.status = ValidationStatus.VALID;
                result.reason = 'Pre-validated (No matching recharge found)';
            } else {
                result.status = ValidationStatus.INVALID;
                
                // Determine specific failure reason (same as before)
                const ticketTime = ticket.parsedDate ? ticket.parsedDate.getTime() : 0;
                const rechargesBeforeTicket = recharges.filter(r => 
                    r.rechargeTime && 
                    r.rechargeTime instanceof Date && 
                    !isNaN(r.rechargeTime.getTime()) &&
                    r.rechargeTime.getTime() < ticketTime
                );
                
                if (rechargesBeforeTicket.length === 0) {
                    result.reason = 'Ticket created before any recharge';
                } else {
                    const ticketDrawStr = ticket.drawDate ? ticket.drawDate.split(/[\/\-]/).reverse().join('-') : '';
                    let reasonFound = false;
                    for (const recharge of rechargesBeforeTicket) {
                        const window = getEligibilityWindow(recharge.rechargeTime);
                        if (window) {
                            const ticketDrawDate = new Date(`${ticketDrawStr}T00:00:00-03:00`);
                            const eligible2Date = new Date(`${window.eligible2Str}T00:00:00-03:00`);
                            if (ticketDrawDate > eligible2Date) {
                                result.reason = 'Recharge expired after 2nd eligible day';
                                reasonFound = true;
                                break;
                            }
                        }
                    }
                    if (!reasonFound) {
                        result.reason = 'Recharge already consumed by previous ticket';
                    }
                }
            }
            
            if (isFirstTicket) {
                console.log('===== VALIDATION RESULT (FIRST TICKET) =====');
                console.log('Status:', result.status);
                console.log('Reason:', result.reason);
                console.log('==========================================');
            }
        }
        
        return result;
    }

    /**
     * Validate all tickets with caching
     * @param {Object[]} entries - All entry objects
     * @param {Object[]} recharges - All recharge objects
     * @param {boolean} skipCache - Skip cache check (for platform-filtered data)
     * @returns {Object} Validation results with statistics
     */
    async function validateAllTickets(entries, recharges, skipCache = false) {
        // Check cache first (only for ALL platform data, not filtered)
        if (!skipCache) {
            const cached = DataFetcher.getCachedValidation();
            if (cached && cached.stats.total === entries.length && cached.entriesCount === entries.length) {
                console.log('Using cached validation results');
                return cached;
            }
        }
        
        console.log('Computing validation results for', entries.length, 'entries with', recharges.length, 'recharges...');
        
        // Debug: Sample some recharge data
        if (recharges.length > 0) {
            const sample = recharges[0];
            console.log('Sample recharge:', {
                gameId: sample.gameId,
                rechargeId: sample.rechargeId?.substring(0, 20) + '...',
                hasTime: !!sample.rechargeTime,
                isDate: sample.rechargeTime instanceof Date,
                amount: sample.amount
            });
        }
        
        // Group recharges by game ID
        const rechargesByGameId = {};
        recharges.forEach(r => {
            if (!r.gameId) return;
            if (!rechargesByGameId[r.gameId]) {
                rechargesByGameId[r.gameId] = [];
            }
            rechargesByGameId[r.gameId].push(r);
        });
        
        console.log('Recharges grouped for', Object.keys(rechargesByGameId).length, 'unique game IDs');
        
        // Group tickets by game ID
        const ticketsByGameId = {};
        entries.forEach(e => {
            if (!e.gameId) return;
            if (!ticketsByGameId[e.gameId]) {
                ticketsByGameId[e.gameId] = [];
            }
            ticketsByGameId[e.gameId].push(e);
        });
        
        // Validate each ticket
        const results = [];
        const stats = {
            total: entries.length,
            valid: 0,
            invalid: 0,
            unknown: 0,
            cutoff: 0
        };
        
        // Process in smaller batches to keep UI responsive
        const batchSize = 50;
        const totalBatches = Math.ceil(entries.length / batchSize);
        
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            
            for (const entry of batch) {
                const validation = validateTicket(entry, rechargesByGameId, ticketsByGameId);
                results.push(validation);
                
                switch (validation.status) {
                    case ValidationStatus.VALID:
                        stats.valid++;
                        break;
                    case ValidationStatus.INVALID:
                        stats.invalid++;
                        break;
                    default:
                        stats.unknown++;
                }
                
                if (validation.isCutoff) {
                    stats.cutoff++;
                }
            }
            
            // Yield to main thread after each batch - use longer delay for UI responsiveness
            if (i + batchSize < entries.length) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }
        
        const result = {
            results,
            stats,
            rechargeCount: recharges.length
        };
        
        console.log('Validation complete:', stats);
        console.log('Sample validated tickets (first 3 VALID):', 
            results.filter(v => v.status === 'VALID').slice(0, 3).map(v => ({
                ticket: v.ticket?.ticketNumber,
                gameId: v.ticket?.gameId,
                hasRecharge: !!v.matchedRecharge,
                amount: v.matchedRecharge?.amount
            }))
        );
        
        // Cache the results
        DataFetcher.setCachedValidation(result);
        
        return result;
    }

    // ============================================
    // Engagement Analysis
    // ============================================
    
    /**
     * Analyze engagement between rechargers and ticket creators
     * @param {Object[]} entries - All entries
     * @param {Object[]} recharges - All recharges
     * @returns {Object} Engagement statistics
     */
    function analyzeEngagement(entries, recharges) {
        // Get unique game IDs
        const rechargerIds = new Set(recharges.map(r => r.gameId).filter(Boolean));
        const ticketCreatorIds = new Set(entries.map(e => e.gameId).filter(Boolean));
        
        // Calculate overlaps
        const participantIds = new Set(
            [...ticketCreatorIds].filter(id => rechargerIds.has(id))
        );
        
        const rechargedNoTicket = new Set(
            [...rechargerIds].filter(id => !ticketCreatorIds.has(id))
        );
        
        // Multi-recharge analysis
        const rechargeCounts = {};
        recharges.forEach(r => {
            if (!r.gameId) return;
            rechargeCounts[r.gameId] = (rechargeCounts[r.gameId] || 0) + 1;
        });
        
        const multiRechargers = Object.entries(rechargeCounts)
            .filter(([_, count]) => count > 1)
            .map(([id, _]) => id);
        
        const multiRechargeNoTicket = multiRechargers.filter(id => !ticketCreatorIds.has(id));
        
        return {
            totalRechargers: rechargerIds.size,
            totalParticipants: participantIds.size,
            rechargedNoTicket: rechargedNoTicket.size,
            participationRate: rechargerIds.size > 0 
                ? ((participantIds.size / rechargerIds.size) * 100).toFixed(1)
                : 0,
            multiRechargeNoTicket: multiRechargeNoTicket.length,
            rechargerIds: [...rechargerIds],
            participantIds: [...participantIds],
            rechargedNoTicketIds: [...rechargedNoTicket]
        };
    }

    /**
     * Analyze engagement by date
     * @param {Object[]} entries - All entries
     * @param {Object[]} recharges - All recharges
     * @param {number} days - Number of days to analyze
     * @returns {Object[]} Daily engagement data
     */
    function analyzeEngagementByDate(entries, recharges, days = 7) {
        const dailyData = [];
        const now = AdminCore.getBrazilTime();
        
        // Pre-compute date strings for all entries (optimization)
        const entriesByDate = new Map();
        entries.forEach(e => {
            if (e.parsedDate && e.parsedDate instanceof Date && !isNaN(e.parsedDate.getTime())) {
                const dateStr = AdminCore.getBrazilDateString(e.parsedDate);
                if (dateStr) {
                    if (!entriesByDate.has(dateStr)) {
                        entriesByDate.set(dateStr, []);
                    }
                    entriesByDate.get(dateStr).push(e);
                }
            }
        });
        
        // Pre-compute date strings for all recharges (optimization)
        const rechargesByDate = new Map();
        recharges.forEach(r => {
            if (r.rechargeTime && r.rechargeTime instanceof Date && !isNaN(r.rechargeTime.getTime())) {
                const dateStr = AdminCore.getBrazilDateString(r.rechargeTime);
                if (dateStr) {
                    if (!rechargesByDate.has(dateStr)) {
                        rechargesByDate.set(dateStr, []);
                    }
                    rechargesByDate.get(dateStr).push(r);
                }
            }
        });
        
        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = AdminCore.getBrazilDateString(date);
            
            // Use pre-computed maps instead of filtering entire arrays each time
            const dayEntries = entriesByDate.get(dateStr) || [];
            const dayRecharges = rechargesByDate.get(dateStr) || [];
            
            const engagement = analyzeEngagement(dayEntries, dayRecharges);
            
            dailyData.push({
                date: dateStr,
                displayDate: AdminCore.formatBrazilDateTime(date, {
                    day: '2-digit',
                    month: '2-digit'
                }),
                totalEntries: dayEntries.length,
                ...engagement
            });
        }
        
        return dailyData;
    }

    // ============================================
    // Public API
    // ============================================
    return {
        // Validation
        validateTicket,
        validateAllTickets,
        
        // Engagement
        analyzeEngagement,
        analyzeEngagementByDate,
        
        // Draw calendar helpers
        isNoDrawDay,
        isEarlyCutoffDay,
        getCutoffHour,
        getNextValidDrawDate,
        getEligibleDrawDate,
        getEligibilityWindow,
        
        // Constants
        ValidationStatus,
        DEFAULT_CUTOFF_HOUR,
        EARLY_CUTOFF_HOUR
    };
})();

