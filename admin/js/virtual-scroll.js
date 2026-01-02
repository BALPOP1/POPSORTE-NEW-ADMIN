/**
 * POP-SORTE Admin Dashboard - Virtual Scroll Module
 * 
 * This module provides virtual scrolling for large tables.
 * Only renders visible rows + buffer, dramatically improving performance
 * for datasets with thousands of rows.
 * 
 * Dependencies: None
 */

// ============================================
// Virtual Scroll Module
// ============================================
window.VirtualScroll = (function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================
    const DEFAULT_ROW_HEIGHT = 48; // pixels
    const BUFFER_SIZE = 10; // rows above/below viewport
    const SCROLL_DEBOUNCE = 16; // ~60fps

    // ============================================
    // VirtualTable Class
    // ============================================
    
    /**
     * Creates a virtual scrolling table
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Container element
     * @param {Array} options.data - Array of row data
     * @param {Function} options.renderRow - Function to render a single row
     * @param {number} [options.rowHeight] - Height of each row in pixels
     * @param {string} [options.emptyMessage] - Message when no data
     */
    class VirtualTable {
        constructor(options) {
            this.container = options.container;
            this.data = options.data || [];
            this.renderRow = options.renderRow;
            this.rowHeight = options.rowHeight || DEFAULT_ROW_HEIGHT;
            this.emptyMessage = options.emptyMessage || 'No data available';
            this.onRowClick = options.onRowClick || null;
            
            // State
            this.scrollTop = 0;
            this.visibleStart = 0;
            this.visibleEnd = 0;
            this.rafId = null;
            
            // Elements
            this.wrapper = null;
            this.viewport = null;
            this.content = null;
            this.tbody = null;
            
            // Bind methods
            this.handleScroll = this.handleScroll.bind(this);
            this.render = this.render.bind(this);
            
            // Initialize
            this.init();
        }

        /**
         * Initialize the virtual table structure
         */
        init() {
            // Clear container
            this.container.innerHTML = '';
            
            // Create wrapper structure
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'virtual-table-wrapper';
            
            // Viewport (scrollable area)
            this.viewport = document.createElement('div');
            this.viewport.className = 'virtual-table-viewport';
            
            // Content (full height spacer)
            this.content = document.createElement('div');
            this.content.className = 'virtual-table-content';
            
            // Table
            const table = document.createElement('table');
            table.className = 'data-table virtual-table';
            
            // TBody for rows
            this.tbody = document.createElement('tbody');
            table.appendChild(this.tbody);
            
            // Assemble
            this.content.appendChild(table);
            this.viewport.appendChild(this.content);
            this.wrapper.appendChild(this.viewport);
            this.container.appendChild(this.wrapper);
            
            // Set up scroll listener
            this.viewport.addEventListener('scroll', this.handleScroll, { passive: true });
            
            // Initial render
            this.updateDimensions();
            this.render();
        }

        /**
         * Update content height based on data length
         */
        updateDimensions() {
            const totalHeight = this.data.length * this.rowHeight;
            this.content.style.height = `${totalHeight}px`;
            
            // Calculate visible rows based on viewport height
            const viewportHeight = this.viewport.clientHeight || 400;
            this.visibleCount = Math.ceil(viewportHeight / this.rowHeight) + (BUFFER_SIZE * 2);
        }

        /**
         * Handle scroll events
         */
        handleScroll() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            
            this.rafId = requestAnimationFrame(() => {
                this.scrollTop = this.viewport.scrollTop;
                this.render();
            });
        }

        /**
         * Render visible rows
         */
        render() {
            if (this.data.length === 0) {
                this.tbody.innerHTML = `
                    <tr>
                        <td colspan="100" class="text-center text-muted" style="padding: 40px;">
                            ${this.emptyMessage}
                        </td>
                    </tr>
                `;
                return;
            }

            // Calculate visible range
            const startIndex = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - BUFFER_SIZE);
            const endIndex = Math.min(this.data.length, startIndex + this.visibleCount);
            
            // Only re-render if range changed significantly
            if (startIndex === this.visibleStart && endIndex === this.visibleEnd) {
                return;
            }
            
            this.visibleStart = startIndex;
            this.visibleEnd = endIndex;

            // Build rows HTML
            const rows = [];
            for (let i = startIndex; i < endIndex; i++) {
                const rowHtml = this.renderRow(this.data[i], i);
                rows.push(rowHtml);
            }

            // Update tbody with positioning
            this.tbody.innerHTML = rows.join('');
            this.tbody.style.transform = `translateY(${startIndex * this.rowHeight}px)`;
            
            // Attach click handlers if needed
            if (this.onRowClick) {
                this.tbody.querySelectorAll('tr[data-index]').forEach(row => {
                    row.addEventListener('click', () => {
                        const index = parseInt(row.dataset.index, 10);
                        this.onRowClick(this.data[index], index);
                    });
                });
            }
        }

        /**
         * Update data and re-render
         * @param {Array} newData - New data array
         */
        setData(newData) {
            this.data = newData || [];
            this.scrollTop = 0;
            this.visibleStart = 0;
            this.visibleEnd = 0;
            this.viewport.scrollTop = 0;
            this.updateDimensions();
            this.render();
        }

        /**
         * Refresh current view
         */
        refresh() {
            this.updateDimensions();
            this.render();
        }

        /**
         * Scroll to specific row
         * @param {number} index - Row index
         */
        scrollToRow(index) {
            const targetScroll = index * this.rowHeight;
            this.viewport.scrollTop = targetScroll;
        }

        /**
         * Get current scroll position info
         * @returns {Object} Scroll info
         */
        getScrollInfo() {
            return {
                scrollTop: this.scrollTop,
                visibleStart: this.visibleStart,
                visibleEnd: this.visibleEnd,
                totalRows: this.data.length
            };
        }

        /**
         * Destroy the virtual table
         */
        destroy() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.viewport.removeEventListener('scroll', this.handleScroll);
            this.container.innerHTML = '';
        }
    }

    // ============================================
    // Factory Function
    // ============================================
    
    /**
     * Create a new virtual table
     * @param {Object} options - Configuration options
     * @returns {VirtualTable} Virtual table instance
     */
    function create(options) {
        return new VirtualTable(options);
    }

    // ============================================
    // Public API
    // ============================================
    return {
        create,
        VirtualTable
    };
})();

