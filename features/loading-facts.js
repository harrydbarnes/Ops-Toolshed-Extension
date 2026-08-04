(function() {
    'use strict';

    const FACTS = window.LOADING_FACTS = Object.freeze([
        "The average person spends 6 months of their life waiting in queues",
        "The longest traffic jam in history lasted 12 days in Beijing (2010)",
        "The word 'queue' comes from the Latin 'cauda', meaning 'tail'",
        "Occupied time feels shorter than unoccupied time - that's why mirrors are by elevators",
        "Disney deliberately snakes their queues to make them look shorter",
        "A 'ji-gong' is a professional line waiter you can hire in China",
        "The average person spends 2 days a year waiting at traffic lights",
        "The 'wait' for the first photo ever taken was 8 hours (1826)",
        "The Eiffel Tower has one of the longest average wait times: over 2 hours",
        "You are currently part of the elite club of people waiting for this specific page",
        "The coding for Prisma references the Yes/No field for Actualisation as 'Ok to Pay'",
        "The first computer bug was an actual real-life moth found in a relay",
        "The first computer mouse was made of wood",
        "Technically, the loading spinner is known as a 'throbber' in UI design",
        "Domain names were free until 1995",
        "Once upon a time, someone in Ops during their first week was caught chain smoking outside whilst 15 minutes late for work",
        "A watched loading spinner takes approximately three times longer. This has not been peer reviewed",
        "The average lift journey lasts less than a minute, although waiting for one can feel considerably longer",
        "Early traffic lights used gas lamps rather than electricity",
        "The first mechanical alarm clock could only ring at 4am",
        "The first text message, sent in 1992, simply said 'Merry Christmas'",
        "The first webcam was created to monitor a coffee pot at Cambridge University",
        "The QWERTY keyboard layout was designed in the age of mechanical typewriters",
        "More than one million computers were connected to the internet by 1992",
        "The first registered domain name was symbolics.com",
        "The first website went live in 1991",
        "The first website explained how the World Wide Web worked",
        "Email existed before the World Wide Web",
        "The @ symbol was chosen for email addresses because it was rarely used in people's names",
        "The first YouTube video was only 19 seconds long",
        "The first Google server was housed in a case partly made from LEGO bricks",
        "Google's original working name was 'BackRub'",
        "UTM stands for Urchin Tracking Module",
        "UTM parameters help analytics tools identify where website traffic originated",
        "UTM tracking was named after Urchin, the analytics company acquired by Google in 2005",
        "UTM parameters travel as part of a URL rather than being hidden inside the page",
        "Inconsistent UTM naming can make one campaign appear as several separate campaigns in reporting",
        "A 1×1 impression tracker records an impression by requesting a tiny, usually invisible image",
        "The visible size of a 1×1 tracker is one pixel wide by one pixel high",
        "An impression tracker can record that an advert loaded without the user ever noticing the pixel",
        "A click tracker records a click before redirecting the browser to the intended destination",
        "A broken click tracker can prevent an otherwise correct advert from reaching its landing page",
        "VAST stands for Video Ad Serving Template",
        "VAST gives video players instructions about which advert to play and which events to track",
        "VAST was introduced by the IAB in 2008 to help video players and ad servers understand one another",
        "A cachebuster helps prevent a tracking request from being mistaken for a previously cached request",
        "One missing character in a tracking URL can turn campaign QA into detective work",
        "QR stands for Quick Response",
        "The QR code was invented in Japan to track automotive parts",
        "The first voluntary standards for common web-banner sizes were announced in 1996",
        "IAB UK has measured the size of Britain's digital advertising industry since 1997",
        "Digital advertising involves an impressive number of systems agreeing that one person saw an MPU",
        "Country pop singer Stella Lefty is the daughter of MediaOcean co-founder Eric Lefkofsky. I wonder if she can book a campaign for us sometime?",
        "Wrike turns a request into a task before it turns into a Prisma. How beautiful!",
        "In Wrike, every time we have a task on hold for more than a day, Prisma gets inpatient like a dog waiting for its dinner",
        "A well-written Wrike request can save a surprising number of follow-up messages.",
        "Christmas campaigns are planned well in advance, but not as early in the year as Trish buys her presents",
        "A task marked “In progress” is sometimes progressing emotionally.",
        "Coca-Cola was first served in Atlanta in 1886.",
        "The Coca-Cola contour bottle was designed in 1915.",
        "Coca-Cola’s name came from coca leaves and kola nuts.",
        "The original Coca-Cola was sold as a syrup at a pharmacy soda fountain.",
        "Coca-Cola’s contour bottle was designed to be recognisable even in the dark.",
        "A Coca-Cola Zero brief always contains zero errors.",
        "Louis-François Cartier founded Cartier in Paris in 1847.",
        "Cartier introduced the Tank watch in 1917.",
        "Cartier’s panther first appeared as a motif in 1914.",
        "The Cartier Love bracelet was introduced in New York in 1969.",
        "Cartier is sometimes called “the jeweller of kings and the king of jewellers”.",
        "Reckitt began as Reckitt & Sons in Hull in 1840.",
        "Dettol was introduced in 1932.",
        "Reckitt’s founder Isaac Reckitt began by making household starch.",
        "A household product can be used in seconds and planned in media for months.",
        "Reckitt brands have turned everyday routines into household names around the world.",
        "Jaguar began in 1922 as the Swallow Sidecar Company.",
        "The original Land Rover was unveiled at the Amsterdam Motor Show in 1948.",
        "Jaguar Land Rover combines two British automotive names with very different origins.",
        "A Jaguar Land Rover campaign has more moving parts than the average media plan.",
        "Estée Lauder launched her company in 1946 with four skincare products.",
        "Estée Lauder’s first department-store counter opened at Saks Fifth Avenue in 1948.",
        "Estée Lauder is widely associated with popularising the gift-with-purchase.",
        "CAPTCHA stands for Completely Automated Public Turing test to tell Computers and Humans Apart",
        "A viewable impression asks whether an advert had an opportunity to be seen, not whether anyone actually looked at it",
        "The save icon is a floppy disk. Please tell me you know what that is?",
        "An advert can be successfully served, measured and reported without being especially memorable",
        "IAB guidance from 2004 recommended limiting pop-up adverts to one per user session. It was a different time",
        "The first computer mouse was made from wood",
        "The first computer bug was an actual moth found trapped in a relay",
        "Tesco began in 1919 when Jack Cohen sold surplus groceries from a market stall in East London",
        "The Tesco name combines the initials of tea supplier T.E. Stockwell with the beginning of Jack Cohen's surname",
        "The first official Tesco store opened in Burnt Oak in 1929",
        "The day after tomorrow is sometimes called 'overmorrow'. Otherwise known as when you should be booking your next campaign by",
        "Tesco Clubcard launched in 1995",
        "Tesco Value launched in 1993",
        "T.E. Stockwell's tea became the first product sold under the Tesco name in 1924",
        "Tesco opened its first self-service store in St Albans in 1948",
        "A Tesco Clubcard mailing in 1999 contained around 80,000 variations of letters, offers and magazines",
        "Tesco celebrated Clubcard's thirtieth anniversary in 2025 by opening a temporary nightclub called Club Card",
        "Tesco's 'Every Little Helps' slogan first appeared during the 1990s",
        "Queue is pronounced the same even if its final four letters are removed",
        "The word 'deadline' once referred to a boundary that prisoners were forbidden to cross",
        "'Uncopyrightable' is one of the longest common English words without a repeated letter",
        "A campaign can have perfect naming conventions right up until somebody adds 'NEW FINAL USE THIS'",
        "The oldest surviving written customer complaint concerns poor-quality copper",
        "Customer complaints have existed for more than three thousand years",
        "Boots began with a herbalist store opened by John Boot in Nottingham in 1849",
        "Boots appointed its first qualified pharmacist in 1884",
        "Boots opened its thousandth store in 1933",
        "Boots introduced a five-day working week for factory staff without reducing their pay during the 1930s",
        "The first speeding conviction involved a vehicle travelling about eight miles per hour",
        "No loading spinner has ever been improved by clicking it repeatedly",
        "Refreshing the page transfers your optimism into a fresh browser request",
        "This loading screen is proudly powered by suspense",
        "Prisma is currently considering your request with the gravity it deserves",
        "Somewhere, a progress bar has reached 99% and chosen to settle down there",
        "The final one percent contains approximately half the work",
        "Your request has entered the mysterious gap between 'clicked' and 'done'",
        "If patience is a virtue, Prisma is providing excellent training",
        "The spinner is moving quickly so the page does not have to",
        "Every rotation brings us spiritually closer to the result",
        "Please enjoy this complimentary moment of professional reflection",
        "The page is loading. Your tea, however, remains an actionable dependency",
        "This is an excellent opportunity to remember why you opened this page",
        "The system is carefully arranging pixels into their preferred order",
        "Your data is travelling through several computers that have never formally met you",
        "Steve Conway is not associated or involved with Conway, the construction company... as far as we know, anyway",
        "The original No7 range launched in 1935 with eleven products",
        "No7 was originally written as 'Number Seven'",
        "The original No7 products used distinctive yellow-and-blue Art Deco packaging",
        "Boots launched Soltan in 1939",
        "Boots helped manufacture penicillin for the British government during the Second World War",
        "Boots became the first UK chemist chain to introduce self-service stores in 1951",
        "The Boots 17 cosmetics range launched in 1968 for a growing teenage market",
        "Ibuprofen was discovered by a Boots research team in Nottingham",
        "Ibuprofen launched as the prescription medicine Brufen in 1969 after sixteen years of research",
        "Boots received a Queen's Award for the discovery and development of ibuprofen in 1985",
        "The first standalone Boots Opticians practice opened in Durham in 1987",
        "Boots introduced its UVA star-rating system for sun-care products in 1992",
        "Boots Advantage Card launched in 1997",
        "Opening another tab is the traditional cure for having too many tabs",
        "The world record for browser tabs is probably held by someone afraid of bookmarks",
        "A bookmark is a tiny promise that you will definitely read something later",
        "'Save as final' is the first stage of a document's lifecycle",
        "'Final v2' is not a contradiction; it is a business process",
        "Any file named 'final_final' is requesting further feedback",
        "A spreadsheet can contain more than one million rows, although it probably should not",
        "Boots launched its Botanics skincare range during the 1990s",
        "The Boots site in Beeston was purchased in 1927 to expand the company's manufacturing capability",
        "Boots once sold stationery, pictures and travel goods alongside medicines in its department-style stores",
        "Early Boots stores placed tempting products near dispensaries for customers waiting for prescriptions",
        "Customers at one early Boots store had to be reassured by staff that its unfamiliar lift was safe",
        "Nestlé's history began in Switzerland during the 1860s",
        "Nestlé's name comes from founder Henri Nestlé",
        "The Nestlé logo is based on the founder's family crest and features a nest",
        "Nescafé launched in 1938 after years of work to turn surplus Brazilian coffee into a soluble drink",
        "Nescafé's name combines Nestlé with café",
        "Nescafé accompanied the Apollo 11 crew on their journey to the Moon",
        "KitKat first launched in York in 1935 under the name 'Chocolate Crisp'",
        "The KitKat name first appeared on the packaging in 1937",
        "'Have a break, have a KitKat' was first used in 1958",
        "KitKat packaging temporarily changed from red to blue during the Second World War",
        "The two-finger KitKat launched in 1960",
        "KitKat Chunky launched in 1999",
        "KitKat is available in more than 80 countries",
        "Japan has produced some unique KitKat flavours, including wasabi and sake",
        "Nestlé acquired Rowntree Mackintosh in 1988, adding KitKat, After Eight and Smarties to its portfolio",
        "Nespresso officially launched in 1986",
        "After Eight is owned by Nestlé, although eating one at 7:59 remains technically possible",
        "Quality Street is owned by Nestlé and still encourages everyone to identify favourites by wrapper colour",
        "A media plan is where dates, budgets and optimism first meet",
        "Campaign naming conventions exist so reports remain comprehensible several weeks later",
        "The fastest way to find a typo in an advert is to publish it",
        "A creative can pass several rounds of approval before somebody notices the landing page is wrong",
        "A campaign labelled 'ASAP' has usually been approaching for some time",
        "A campaign brief can become longer than the campaign itself",
        "An impression means an advert was counted, not that someone admired it",
        "A click tracker briefly receives a click before sending the user towards the intended landing page",
        "A 1×1 impression tracker is tiny enough to be invisible and important enough to cause a large discrepancy",
        "Cachebusters usually contain a changing value so separate tracking requests are not treated as the same request",
        "A campaign can be live, underdelivering and awaiting assets at the same time",
        "A missing question mark can be the difference between a working URL and an afternoon of troubleshooting",
        "Copying an ad tag into an email is a reliable way to discover how long an email can become",
        "The phrase 'small amends' has no formally agreed relationship with the number of requested changes",
        "A screenshot proves what appeared on one screen at one particular moment, which is sometimes exactly what QA needs",
        "Every campaign eventually reaches the stage where somebody asks whether the tracker was included",
        "A tracker spreadsheet is where campaign URLs go to be checked, colour-coded and checked again",
        "Campaign launch dates have a remarkable ability to remain fixed while everything before them moves",
        "The spinning wheel is performing the universal dance of unfinished business",
        "This fact was delivered while your actual request remained fashionably late",
        "Your click has been received and is being processed by the appropriate mysteries",
        "Prisma has not forgotten you; it is merely composing itself",
        "The system is fetching your data from somewhere described only as 'the backend'",
        "There is no evidence that glaring at the screen increases network speed",
        "Leaning closer to the monitor does not make the page arrive sooner",
        "Saying 'Come on' may improve morale but not response time",
        "This pause is brought to you by computers doing computer things",
        "The next screen may contain exactly what you asked for, which is exciting",
        "You have now completed another compulsory microbreak",
        "Thank you for waiting. Your patience has been noted but cannot currently be exchanged for points",
        "In total, you have seen this spinning wheel for {{TIME}}. Share this with Harry to help speed up Prisma!"
    ]);

    // Pre-calculate non-time facts for fallback optimization
    const NON_TIME_FACTS = FACTS.filter(f => !f.includes('{{TIME}}'));

    const DEBOUNCE_DELAY_MS = 200;
    const ANIMATION_DURATION_MS = 500;
    const CAMPAIGN_LOADING_END_DELAY_MS = 2500;
    const HOVER_EXIT_DELAY_MS = 2000;
    const RECENT_FACT_HISTORY_LIMIT = 60;

    function getStorageArea(area) {
        if (typeof chrome === 'undefined') return null;
        return chrome.storage?.[area] || null;
    }

    function getStorageData(area, keys) {
        return new Promise(resolve => {
            const storageArea = getStorageArea(area);
            if (!storageArea?.get) {
                resolve({});
                return;
            }

            let settled = false;
            const resolveOnce = data => {
                if (settled) return;
                settled = true;
                resolve(data || {});
            };

            try {
                const result = storageArea.get(keys, resolveOnce);
                if (result?.then) result.then(resolveOnce).catch(() => resolveOnce({}));
            } catch (_error) {
                resolveOnce({});
            }
        });
    }

    function setStorageData(area, values) {
        const storageArea = getStorageArea(area);
        if (!storageArea?.set) return;

        try {
            const result = storageArea.set(values);
            if (result?.catch) result.catch(() => {});
        } catch (_error) {
            // Loading facts remain available if storage is unavailable.
        }
    }

    class LoadingFactsFeature {
        constructor() {
            this.toastId = 'ops-toolshed-loading-toast';
            this.isVisible = false;
            this.debounceTimer = null;
            this.isEnabled = true; // Default to enabled
            this.isIntersecting = false; // Track viewport visibility
            this.observedSpinner = null;
            this.pendingShow = false;
            this.requestId = 0;
            this.campaignEndTimer = null;
            this.toastRemovalTimer = null;
            this.hoverExitTimer = null;
            this.isToastHovered = false;
            this.pendingToastHide = false;

            // State for managing async settings load
            this.settingsLoaded = false;

            // Listen for changes
            const storageChanges = typeof chrome === 'undefined'
                ? null
                : chrome.storage?.onChanged;
            storageChanges?.addListener((changes, area) => {
                if (area === 'sync' && changes.loadingFactsEnabled) {
                    this.isEnabled = changes.loadingFactsEnabled.newValue !== false;
                    // If disabled while visible, hide immediately
                    if (!this.isEnabled && this.isVisible) {
                        this.hideToast({ force: true });
                    }
                }
            });
            document.addEventListener('toolshed-loading-fact-suppression', event => {
                if (event.detail?.active !== true) return;
                this.cancelCampaignEndTimer();
                this.intersectionObserver?.disconnect?.();
                this.observedSpinner = null;
                this.isIntersecting = false;
                this.hideToast({ force: true });
            });
        }

        async initialize() {
            const data = await getStorageData('sync', 'loadingFactsEnabled');

            this.isEnabled = data.loadingFactsEnabled !== false;
            this.settingsLoaded = true;

            if (window.loadingMonitor?.subscribe) {
                this.unsubscribeLoadingMonitor = window.loadingMonitor.subscribe(state => {
                    this.checkForLoading(state);
                });
            }

            // IntersectionObserver for visibility tracking
            this.intersectionObserver = new IntersectionObserver((entries) => {
                const entry = entries.find(item => item.target === this.observedSpinner);
                if (!entry) return;

                this.isIntersecting = entry.isIntersecting;
                if (this.isIntersecting && this.isElementVisible(this.observedSpinner)) {
                    this.showToast(this.observedSpinner);
                } else {
                    this.handleNoVisibleSpinner();
                }
            }, { threshold: 0.1 }); // Trigger when at least 10% visible

            // Fallback for isolated tests or older extension contexts that do not
            // have the shared loading monitor.
            if (!window.loadingMonitor?.subscribe) this.checkForLoading();
        }

        isElementVisible(element) {
            return window.utils.isElementVisible(element);
        }

        isCampaignRoute() {
            if (!window.location.pathname.includes('/campaign-management')) return false;
            const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            return Boolean(params.get('campaign-id'));
        }

        isCampaignGridReady() {
            return Array.from(document.querySelectorAll(
                '.ht_master .htCore.mediaocean.worksheet [id="placementName-0"]'
            )).some(cell => cell.textContent?.trim() === 'Media total');
        }

        isInsideSidePanel(element) {
            if (window.loadingMonitor?.isInsideSidePanel) {
                return window.loadingMonitor.isInsideSidePanel(element);
            }
            let current = element;
            while (current) {
                if (current.matches?.('mo-side-panel, .workflow-widget-wrapper')) return true;
                const root = current.getRootNode?.();
                current = current.parentElement || root?.host || null;
            }
            return false;
        }

        isLoadingFactSuppressed() {
            return Boolean(document.body?.classList?.contains('toolshed-opening-moe'));
        }

        cancelCampaignEndTimer() {
            if (this.campaignEndTimer === null) return;
            clearTimeout(this.campaignEndTimer);
            this.campaignEndTimer = null;
        }

        cancelHoverExitTimer() {
            if (this.hoverExitTimer === null) return;
            clearTimeout(this.hoverExitTimer);
            this.hoverExitTimer = null;
        }

        keepToastVisible() {
            this.pendingToastHide = false;
            this.cancelHoverExitTimer();
            const toast = document.getElementById(this.toastId);
            if (!toast) return;

            if (this.toastRemovalTimer !== null) {
                clearTimeout(this.toastRemovalTimer);
                this.toastRemovalTimer = null;
            }
            toast.classList.remove('slide-down');
            toast.classList.add('slide-up');
            this.isVisible = true;
        }

        requestToastHide() {
            const toast = document.getElementById(this.toastId);
            if (!toast) {
                this.isVisible = false;
                return;
            }
            if (this.isToastHovered) {
                this.pendingToastHide = true;
                return;
            }
            this.hideToast();
        }

        handleNoVisibleSpinner() {
            if (this.isCampaignRoute() && document.getElementById(this.toastId)) {
                this.scheduleCampaignEnd();
            } else {
                this.requestToastHide();
            }
        }

        scheduleCampaignEnd() {
            if (this.campaignEndTimer !== null) return;
            this.campaignEndTimer = setTimeout(() => {
                this.campaignEndTimer = null;
                const monitorState = window.loadingMonitor?.getState?.();
                const visibleSpinner = monitorState
                    ? monitorState.pageVisibleSpinners[0]
                    : window.utils.findVisibleLoadingSpinners()
                        .find(candidate => !this.isInsideSidePanel(candidate));
                if (visibleSpinner && this.isElementVisible(visibleSpinner)) {
                    this.checkForLoading();
                    return;
                }
                this.requestToastHide();
            }, CAMPAIGN_LOADING_END_DELAY_MS);
        }

        getSpinnerTarget(spinner) {
            if (!spinner) return null;
            if (spinner.offsetWidth <= 100) return spinner;
            return spinner.querySelector('svg') ||
                (spinner.shadowRoot ? window.utils.queryShadowDom('svg', spinner.shadowRoot) : null) ||
                spinner;
        }

        updateToastPosition(spinner) {
            const toast = document.getElementById(this.toastId);
            const target = this.getSpinnerTarget(spinner);
            if (!toast || !target) return false;
            const rect = target.getBoundingClientRect();
            if (!Number.isFinite(rect.left) || rect.width <= 0 || rect.height <= 0) return false;
            toast.style.left = `${rect.left + (rect.width / 2)}px`;
            return true;
        }

        checkForLoading(monitorState = null) {
            if (monitorState) this.latestLoadingState = monitorState;
            // Debounce the check to prevent flickering
            if (this.debounceTimer) clearTimeout(this.debounceTimer);

            this.debounceTimer = setTimeout(() => {
                // Don't run until settings are loaded
                if (!this.settingsLoaded) {
                    return;
                }

                // If feature is disabled, ensure toast is hidden and return
                if (!this.isEnabled) {
                    if (this.isVisible) this.hideToast({ force: true });
                    return;
                }

                // Direct Moe opens a native support surface that can expose a
                // short-lived page spinner. It is not Prisma work, so do not
                // show or retain a Loading Fact for that hand-off.
                if (this.isLoadingFactSuppressed()) {
                    this.cancelCampaignEndTimer();
                    this.intersectionObserver.disconnect();
                    this.observedSpinner = null;
                    this.isIntersecting = false;
                    this.hideToast({ force: true });
                    return;
                }

                const state = this.latestLoadingState || window.loadingMonitor?.getState?.();
                const visibleSpinners = state?.visibleSpinners || window.utils.findVisibleLoadingSpinners();
                const spinner = state
                    ? state.pageVisibleSpinners[0] || null
                    : visibleSpinners.find(candidate => !this.isInsideSidePanel(candidate)) || null;
                const hasSidePanelSpinner = state
                    ? state.sidePanelVisibleSpinners.length > 0
                    : visibleSpinners.some(candidate => this.isInsideSidePanel(candidate));

                // Side-panel work (for example submitting a campaign for approval)
                // is intentionally excluded from loading facts.
                if (hasSidePanelSpinner && !spinner) {
                    this.cancelCampaignEndTimer();
                    this.intersectionObserver.disconnect();
                    this.observedSpinner = null;
                    this.isIntersecting = false;
                    this.hideToast({ force: true });
                    return;
                }

                // Strict Visibility Check
                // We check if it exists AND is visually perceptible
                // NOTE: 'isIntersecting' is updated asynchronously by the observer callback.
                // We must attach the observer first to get updates.
                const domVisible = spinner && this.isElementVisible(spinner);

                if (domVisible) {
                    this.cancelCampaignEndTimer();
                    this.keepToastVisible();
                    if (spinner !== this.observedSpinner) {
                        this.intersectionObserver.disconnect();
                        this.observedSpinner = spinner;
                        this.isIntersecting = false;
                        this.updateToastPosition(spinner);
                        this.intersectionObserver.observe(spinner);
                    } else if (this.isIntersecting) {
                        this.showToast(spinner);
                    }
                } else {
                    this.intersectionObserver.disconnect();
                    this.observedSpinner = null;
                    this.isIntersecting = false;
                    this.handleNoVisibleSpinner();
                }
            }, DEBOUNCE_DELAY_MS);
        }

        formatTime(seconds) {
            if (!seconds) return '0s';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);

            const parts = [];
            if (h > 0) parts.push(`${h}h`);
            if (m > 0) parts.push(`${m}m`);
            if (s > 0 || parts.length === 0) parts.push(`${s}s`);

            return parts.join(' ');
        }

        async getProcessedFact() {
            const data = await getStorageData('local', [
                'legacyStats', 'dailyStats', 'prismaUserStats', 'loadingFactRatings', 'loadingFactHistory'
            ]);
            const historicTime = data.legacyStats?.totalLoadingTime ??
                data.prismaUserStats?.totalLoadingTime ??
                0;
            const dailyTime = Object.values(data.dailyStats || {}).reduce(
                (total, stats) => total + (Number(stats?.loadingTime) || 0),
                0
            );
            const time = historicTime + dailyTime;

            // If time is available (>0), we can pick from ALL facts (including {{TIME}} ones).
            // If time is 0, we must restrict selection to NON_TIME_FACTS only.
            const availableFacts = (time > 0) ? FACTS : NON_TIME_FACTS;
            const ratings = data.loadingFactRatings || {};
            const factPool = availableFacts.filter(fact => ratings[fact] !== 'remove');

            if (factPool.length > 0) {
                const recentHistory = Array.isArray(data.loadingFactHistory)
                    ? data.loadingFactHistory.filter(fact => factPool.includes(fact))
                    : [];
                const unseenFacts = factPool.filter(fact => !recentHistory.includes(fact));
                const selectionPool = unseenFacts.length > 0 ? unseenFacts : factPool;
                const fact = selectionPool[Math.floor(Math.random() * selectionPool.length)];
                const updatedHistory = [fact, ...recentHistory.filter(item => item !== fact)]
                    .slice(0, RECENT_FACT_HISTORY_LIMIT);

                setStorageData('local', { loadingFactHistory: updatedHistory });

                // If we picked a time-based fact, format and replace the placeholder
                if (fact.includes('{{TIME}}')) {
                    const timeStr = this.formatTime(time);
                    return fact.replace('{{TIME}}', timeStr);
                }
                return fact;
            }

            return "Loading..."; // Ultimate fallback
        }

        async rateFact(fact, rating) {
            if (!fact || !['remove', 'notSure'].includes(rating)) return;

            const data = await getStorageData('local', 'loadingFactRatings');
            const ratings = { ...(data.loadingFactRatings || {}), [fact]: rating };
            setStorageData('local', { loadingFactRatings: ratings });
        }

        async showToast(spinner) {
            if (this.isLoadingFactSuppressed()) {
                this.hideToast({ force: true });
                return;
            }
            if (document.getElementById(this.toastId) || this.pendingShow || !spinner) return;

            this.pendingShow = true;
            const requestId = ++this.requestId;
            const fact = await this.getProcessedFact();
            this.pendingShow = false;

            if (requestId !== this.requestId ||
                !this.isEnabled ||
                !this.isIntersecting ||
                spinner !== this.observedSpinner ||
                this.isLoadingFactSuppressed() ||
                this.isInsideSidePanel(spinner) ||
                !spinner.isConnected ||
                !this.isElementVisible(spinner) ||
                document.getElementById(this.toastId)) {
                return;
            }

            // Revert Wrapper Logic: Do NOT wrap the spinner.
            // Use sibling injection with absolute positioning.

            const toast = document.createElement('div');
            toast.id = this.toastId;
            toast.className = 'loading-fact-toast slide-up';
            toast.style.left = '50vw';
            toast.style.visibility = 'hidden';

            // Add resize listener to track window changes
            this.resizeHandler = () => requestAnimationFrame(() => {
                if (this.observedSpinner) this.updateToastPosition(this.observedSpinner);
            });
            window.addEventListener('resize', this.resizeHandler);

            // Create inner content structure
            const iconDiv = document.createElement('div');
            iconDiv.className = 'loading-fact-icon';
            iconDiv.textContent = '⏳';
            toast.appendChild(iconDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'loading-fact-content';

            const strong = document.createElement('strong');
            strong.textContent = 'Did you know?';
            contentDiv.appendChild(strong);

            const span = document.createElement('span');
            span.textContent = fact;
            contentDiv.appendChild(span);

            toast.appendChild(contentDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'loading-fact-actions';

            const notSureButton = document.createElement('button');
            notSureButton.type = 'button';
            notSureButton.className = 'loading-fact-action loading-fact-action--not-sure';
            notSureButton.textContent = '?';
            notSureButton.setAttribute('aria-label', 'Mark this loading fact as not sure');
            notSureButton.title = 'Not sure about this fact';

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'loading-fact-action loading-fact-action--remove';
            removeButton.textContent = '×';
            removeButton.setAttribute('aria-label', 'Remove this loading fact');
            removeButton.title = 'Remove this fact';

            const handleRating = async (rating) => {
                notSureButton.disabled = true;
                removeButton.disabled = true;
                await this.rateFact(fact, rating);
                toast.classList.add(`loading-fact-toast--${rating}`);
                toast.setAttribute('aria-label', rating === 'remove'
                    ? 'Loading fact removed'
                    : 'Loading fact marked as not sure');
            };

            notSureButton.addEventListener('click', () => handleRating('notSure'));
            removeButton.addEventListener('click', () => handleRating('remove'));
            actionsDiv.append(notSureButton, removeButton);
            toast.appendChild(actionsDiv);

            toast.addEventListener('pointerenter', () => {
                this.isToastHovered = true;
                this.cancelHoverExitTimer();
            });
            toast.addEventListener('pointerleave', () => {
                this.isToastHovered = false;
                if (!this.pendingToastHide) return;
                this.cancelHoverExitTimer();
                this.hoverExitTimer = setTimeout(() => {
                    this.hoverExitTimer = null;
                    if (this.pendingToastHide && !this.isToastHovered) this.hideToast();
                }, HOVER_EXIT_DELAY_MS);
            });

            // Append to document.body to ensure it floats above all other content
            document.body.appendChild(toast);
            const revealToast = () => {
                this.updateToastPosition(spinner);
                toast.style.visibility = 'visible';
            };
            if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(() => window.requestAnimationFrame(revealToast));
            } else {
                revealToast();
            }
            this.isVisible = true;
        }

        hideToast({ force = false } = {}) {
            this.cancelCampaignEndTimer();
            this.requestId += 1;
            this.pendingShow = false;
            const toast = document.getElementById(this.toastId);
            if (!toast) {
                this.isVisible = false;
                return;
            }

            if (!force && this.isToastHovered) {
                this.pendingToastHide = true;
                return;
            }

            this.pendingToastHide = false;
            this.cancelHoverExitTimer();
            if (this.toastRemovalTimer !== null || toast.classList.contains('slide-down')) return;

            // Cleanup resize listener
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
                this.resizeHandler = null;
            }

            // Replace slide-up class with slide-down for exit animation
            toast.classList.remove('slide-up');
            toast.classList.add('slide-down');

            // Wait for animation to finish before removing
            this.toastRemovalTimer = setTimeout(() => {
                // Simply remove the toast element
                if (toast && toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.toastRemovalTimer = null;
                this.isVisible = false;
            }, ANIMATION_DURATION_MS); // Match CSS animation duration
        }
    }

    // Expose the feature globally
    window.loadingFactsFeature = new LoadingFactsFeature();
})();
