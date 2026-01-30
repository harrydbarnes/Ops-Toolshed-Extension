class FeedbackModal {
    constructor() {
        this.step = 1;
        this.data = {
            section: '',
            tip: '',
            ideaBy: '',
            name: localStorage.getItem('opsToolshed_userName') || ''
        };
        this.root = null;
    }

    initialize() {
        // Entry point if needed for external triggers
    }

    open() {
        if (document.getElementById('ops-toolshed-feedback-root')) return;
        this.step = 1;
        this.render();
        // Wait for frame to ensure DOM is measured correctly
        requestAnimationFrame(() => this.updateUI());
    }

    close() {
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
    }

    showToast(message, type = 'default') {
        const toast = this.root.querySelector('.otf-toast');
        if (!toast) return;

        toast.textContent = message;
        toast.className = `otf-toast ${type} visible`;

        // Hide after 3 seconds
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.className = 'otf-toast';
        }, 3000);
    }

    handleNext() {
        const section = document.getElementById('otf-section').value;
        const type = document.getElementById('otf-type').value;
        const tip = document.getElementById('otf-tip').value;
        const ideaBy = document.getElementById('otf-ideaBy').value;
        const name = document.getElementById('otf-name').value;

        if (!section || !type || !tip || !ideaBy || !name) {
            this.showToast("Please fill in all fields", "error");
            return;
        }

        this.data = { section, type, tip, ideaBy, name };
        localStorage.setItem('opsToolshed_userName', name);
        
        this.step = 2;
        this.updateUI();
    }

    handleBack() {
        this.step = 1;
        this.updateUI();
    }

    handleSubmit() {
        const now = new Date();
        const uniqueId = `${now.getDate().toString().padStart(2, '0')}${
            (now.getMonth() + 1).toString().padStart(2, '0')}-${
            now.getHours().toString().padStart(2, '0')}:${
            now.getMinutes().toString().padStart(2, '0')}`;

        const subject = `Ops Toolshed Feedback - ${this.data.section} (${uniqueId})`;
        const body = `Hello Harry,

Please find below details of a ${this.data.type} for the Ops Toolshed Extension.

Section: ${this.data.section}
Type: ${this.data.type}
Detail: ${this.data.tip}
Who had this idea/told you: ${this.data.ideaBy}

Thank you,
${this.data.name}`;

        this.showToast("Email opening: look for it now.", "success");

        // Small delay to let the toast be seen before the mail client potentially covers screen
        setTimeout(() => {
            window.location.href = `mailto:harry.barnes@wppmedia.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            // Close modal shortly after
            setTimeout(() => this.close(), 1000);
        }, 500);
    }

    updateUI() {
        const track = this.root.querySelector('.otf-slider-track');
        const viewport = this.root.querySelector('.otf-slider-viewport');
        const step1 = this.root.querySelector('#otf-step-1');
        const step2 = this.root.querySelector('#otf-step-2');
        
        const backBtn = this.root.querySelector('#otf-back-btn');
        const nextBtn = this.root.querySelector('#otf-next-btn');
        const indicator = this.root.querySelector('.otf-step-indicator');

        // Logic for Sliding and Resizing
        if (this.step === 1) {
            // Slide to 0%
            track.style.transform = 'translateX(0)';
            step1.classList.add('active');
            step2.classList.remove('active');
            
            // Animate Height - Measure Step 1
            const height = step1.scrollHeight;
            viewport.style.height = `${height}px`;

            // Button State
            backBtn.style.visibility = 'hidden';
            nextBtn.textContent = 'Next';
            nextBtn.onclick = () => this.handleNext();
        } else {
            // Slide to -50%
            track.style.transform = 'translateX(-50%)'; 
            step1.classList.remove('active');
            step2.classList.add('active');

            // Animate Height - Measure Step 2
            const height = step2.scrollHeight;
            viewport.style.height = `${height}px`;

            // Button State
            backBtn.style.visibility = 'visible';
            nextBtn.textContent = 'Submit';
            nextBtn.onclick = () => this.handleSubmit();
        }
        
        indicator.textContent = `${this.step}/2`;
    }

    render() {
        this.root = document.createElement('div');
        this.root.id = 'ops-toolshed-feedback-root';
        
        const categories = [
            "Prisma Approvers", "Campaign Tools", "Reminders", "D-Number Search", 
            "Order ID Copy", "Live Chat", "Stats", "General/Other"
        ];

        this.root.innerHTML = `
            <div class="otf-overlay"></div>
            <div class="otf-modal">
                <button class="otf-btn-close">&times;</button>
                <div class="otf-header">
                    <h2>Submit Feedback</h2>
                    <p>All feedback is welcome - thank you!</p>
                </div>
                
                <div class="otf-slider-viewport">
                    <div class="otf-slider-track">
                        <div id="otf-step-1" class="otf-step active">
                            <div class="otf-grid">
                                <div class="otf-field">
                                    <label class="otf-label" for="otf-section">Section</label>
                                    <select id="otf-section" class="otf-select">
                                        <option value="" disabled selected>Select a section</option>
                                        ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="otf-field">
                                    <label class="otf-label" for="otf-type">Type</label>
                                    <select id="otf-type" class="otf-select">
                                        <option value="Feedback">Feedback</option>
                                        <option value="Bug Report">Bug Report</option>
                                        <option value="Suggestion">Suggestion</option>
                                    </select>
                                </div>
                                <div class="otf-field">
                                    <label class="otf-label" for="otf-tip">Detail</label>
                                    <textarea id="otf-tip" class="otf-textarea" placeholder="Share your tip or bug report here..."></textarea>
                                </div>
                                <div class="otf-field">
                                    <label class="otf-label" for="otf-ideaBy">Info from</label>
                                    <input id="otf-ideaBy" class="otf-input" placeholder="Who told you this?" value="${this.data.ideaBy}">
                                </div>
                                <div class="otf-field">
                                    <label class="otf-label" for="otf-name">Your Name</label>
                                    <input id="otf-name" class="otf-input" placeholder="Your name" value="${this.data.name}">
                                </div>
                            </div>
                        </div>

                        <div id="otf-step-2" class="otf-step">
                            <div class="otf-step-2-content">
                                <p>Click 'Submit' to open a pre-filled email, then hit 'Send' in your email client.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="otf-footer">
                    <div style="width: 64px">
                        <button id="otf-back-btn" class="otf-btn otf-btn-ghost" style="visibility: hidden">Back</button>
                    </div>
                    <span class="otf-step-indicator">1/2</span>
                    <div style="width: 64px; display: flex; justify-content: flex-end;">
                        <button id="otf-next-btn" class="otf-btn otf-btn-primary">Next</button>
                    </div>
                </div>

                <div class="otf-toast"></div>
            </div>
        `;

        document.body.appendChild(this.root);

        // Bind events
        this.root.querySelector('.otf-overlay').onclick = () => this.close();
        this.root.querySelector('.otf-btn-close').onclick = () => this.close();
        this.root.querySelector('#otf-back-btn').onclick = () => this.handleBack();
        this.root.querySelector('#otf-next-btn').onclick = () => this.handleNext();
    }
}

// Expose to window
window.feedbackModalFeature = new FeedbackModal();
