// This function is intended to be executed in the context of a webpage
// via chrome.scripting.executeScript.
export function scrapeAndDownloadCsv() {
    (async () => {
        const scrapingMessage = document.createElement('div');
        scrapingMessage.id = 'scraping-in-progress-message';
        Object.assign(scrapingMessage.style, {
            position: 'fixed', top: '20px', right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white',
            padding: '15px', borderRadius: '8px', zIndex: '10001', fontSize: '16px'
        });
        document.body.appendChild(scrapingMessage);

        const cleanupUI = () => {
            if (document.getElementById('scraping-in-progress-message')) {
                document.getElementById('scraping-in-progress-message').remove();
            }
        };

        const delay = ms => new Promise(res => setTimeout(res, ms));

        try {
            scrapingMessage.innerHTML = 'Scraping data...<br>Scraped 0 rows.';
            const wantedHeaders = ["Campaign", "Starts", "Ends", "Tags", "Impressions", "Budget", "Amount spent"];
            const grid = document.querySelector('[role="table"]');
            if (!grid) throw new Error("Could not find the main data table.");

            let scrollContainer = grid.parentElement;
            while(scrollContainer && scrollContainer.scrollHeight <= scrollContainer.clientHeight && scrollContainer.tagName !== 'BODY') {
                scrollContainer = scrollContainer.parentElement;
            }
            if (!scrollContainer || scrollContainer.tagName === 'BODY') {
                scrollContainer = document.querySelector('div._7mkk') || window;
            }

            const allHeaderElements = Array.from(grid.querySelectorAll('[role="columnheader"]'));
            const allHeaderTexts = allHeaderElements.map(el => el.innerText.trim());
            const wantedHeaderInfo = wantedHeaders.map(wantedHeader => {
                const index = allHeaderTexts.findIndex(header => header.startsWith(wantedHeader));
                if (index === -1) throw new Error(`Could not find column: "${wantedHeader}"`);
                return { name: wantedHeader, index: index + 1 };
            });

            const allRowsData = [];
            const processedRowKeys = new Set();
            let consecutiveNoNewRows = 0;

            while (consecutiveNoNewRows < 3) {
                const currentScrollTop = scrollContainer.scrollTop || window.scrollY;
                const dataRowElements = Array.from(grid.querySelectorAll('._1gda'));
                if (dataRowElements.length === 0 && allRowsData.length === 0) throw new Error("Found table headers, but no data rows.");

                let newRowsFoundInThisPass = false;
                const getCellText = (cell, headerName) => {
                    if (!cell) return "";
                    let text = cell.innerText;
                    if (headerName === "Amount spent" || headerName === "Budget") return text.replace(/[£,Â]/g, '').split('\n')[0].trim();
                    if (headerName === "Ends") return text.split('\n')[0];
                    return text.replace(/\n/g, ' ').trim();
                };

                for (const rowEl of dataRowElements) {
                    const cellElements = Array.from(rowEl.querySelectorAll('._4lg0'));
                    const campaignCell = cellElements[wantedHeaderInfo.find(h => h.name === 'Campaign').index];
                    const startsCell = cellElements[wantedHeaderInfo.find(h => h.name === 'Starts').index];
                    const rowKey = (campaignCell?.innerText || '') + '||' + (startsCell?.innerText || '');

                    if (rowKey && !processedRowKeys.has(rowKey)) {
                        processedRowKeys.add(rowKey);
                        newRowsFoundInThisPass = true;
                        const rowData = {};
                        wantedHeaderInfo.forEach(info => {
                            rowData[info.name] = getCellText(cellElements[info.index], info.name);
                        });
                        allRowsData.push(rowData);
                    }
                }

                scrapingMessage.innerHTML = `Scraping data...<br>Scraped ${allRowsData.length} rows.`;
                if (newRowsFoundInThisPass) consecutiveNoNewRows = 0; else consecutiveNoNewRows++;

                if (scrollContainer === window) window.scrollBy(0, window.innerHeight * 0.8);
                else scrollContainer.scrollBy(0, scrollContainer.clientHeight * 0.8);

                await delay(1000);
                if ((scrollContainer.scrollTop || window.scrollY) === currentScrollTop && !newRowsFoundInThisPass) break;
            }

            // --- CSV Generation ---
            const escapeCsvCell = (cell) => {
                if (cell === null || cell === undefined) return '';
                let cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            };

            let csvContent = wantedHeaders.join(',') + '\n';
            allRowsData.forEach(rowDataObj => {
                const rowValues = wantedHeaders.map(header => escapeCsvCell(rowDataObj[header]));
                csvContent += rowValues.join(',') + '\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = 'meta_billing_check.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (e) {
            console.error("Error during Meta Billing Check:", e);
            alert("An error occurred while scraping: " + e.message);
        } finally {
            cleanupUI();
        }
    })();
}