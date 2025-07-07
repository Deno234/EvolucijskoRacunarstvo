document.addEventListener('DOMContentLoaded', () => {
    new AIModelEvaluator();
});

class AIModelEvaluator {
    constructor() {
        this.username = localStorage.getItem('evaluatorUsername') || '';
        this.currentComparison = null;
        
        this.ui = {
            userPrompt: document.getElementById('user-prompt'),
            usernameInput: document.getElementById('username-input'),
            startBtn: document.getElementById('start-evaluation-btn'),
            evalWrapper: document.getElementById('evaluation-wrapper'),
            completionScreen: document.getElementById('completion-screen'),
            inputText: document.getElementById('input-text'),
            modelAName: document.getElementById('model-a-name'),
            modelAOutput: document.getElementById('model-a-output'),
            modelBName: document.getElementById('model-b-name'),
            modelBOutput: document.getElementById('model-b-output'),
            progressFill: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-text'),
            voteBtns: document.querySelectorAll('.vote-buttons .vote-btn')
        };

        this.initializeEventListeners();
        this.init();
    }

    init() {
        if (this.username) {
            this.ui.usernameInput.value = this.username;
            this.startEvaluation();
        } else {
            this.showLogin();
        }
    }

    initializeEventListeners() {
        this.ui.startBtn.addEventListener('click', () => {
            const enteredUsername = this.ui.usernameInput.value.trim();
            if (enteredUsername) {
                this.username = enteredUsername;
                localStorage.setItem('evaluatorUsername', this.username);
                this.startEvaluation();
            } else {
                alert('Molimo unesite ime.');
            }
        });

        document.querySelector('.voting-section').addEventListener('click', (e) => {
            if (e.target.matches('.vote-btn')) {
                const decisionMap = {
                    'vote-a': 'A',
                    'vote-b': 'B',
                    'vote-tie': 'TIE',
                    'vote-bad': 'BAD'
                };
                const decision = decisionMap[e.target.id];
                if (decision) {
                    this.submitVote(decision);
                }
            }
        });
    }

    showLogin() {
        this.ui.userPrompt.classList.remove('hidden');
        this.ui.evalWrapper.classList.add('hidden');
        this.ui.completionScreen.classList.add('hidden');
    }
    
    showEvaluation() {
        this.ui.userPrompt.classList.add('hidden');
        this.ui.evalWrapper.classList.remove('hidden');
        this.ui.completionScreen.classList.add('hidden');
    }

    async startEvaluation() {
        this.showEvaluation();
        await this.loadNextComparison();
    }
    
    async fetchAPI(endpoint, body) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `HTTP greška! Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Greška pri pozivu ${endpoint}:`, error);
            alert(`Došlo je do greške u komunikaciji sa serverom: ${error.message}`);
            return null;
        }
    }

    async loadNextComparison() {
        this.setVotingButtonsDisabled(true);
        const data = await this.fetchAPI('/api/next-comparison', { username: this.username });

        if (data) {
            if (data.completed) {
                this.showCompletion(data.progress?.total || 'svih');
                return;
            }
            this.currentComparison = data;
            this.updateUI();
        }
        this.setVotingButtonsDisabled(false);
    }

    updateUI() {
        const { input, modelA, modelB, progress } = this.currentComparison;
        this.ui.inputText.textContent = input;
        this.ui.modelAName.textContent = `Model ${modelA.name}`;
        this.ui.modelAOutput.textContent = modelA.output;
        this.ui.modelBName.textContent = `Model ${modelB.name}`;
        this.ui.modelBOutput.textContent = modelB.output;
        
        const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
        this.ui.progressFill.style.width = `${progressPercent}%`;
        this.ui.progressText.textContent = `Pitanje ${progress.current} od ${progress.total}`;
    }

    async submitVote(decision) {
        this.setVotingButtonsDisabled(true);
        const score = { decision };
        const result = await this.fetchAPI('/api/submit-score', { username: this.username, score });
        if (result && result.success) {
            await this.loadNextComparison();
        } else {
            this.setVotingButtonsDisabled(false);
        }
    }
    
    setVotingButtonsDisabled(disabled) {
        this.ui.voteBtns.forEach(btn => btn.disabled = disabled);
    }

    showCompletion(total) {
        this.ui.evalWrapper.classList.add('hidden');
        this.ui.completionScreen.classList.remove('hidden');
        this.ui.completionScreen.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Uspješno ste završili svih ${total} kombinacija!</h2>
                <p>Hvala vam na sudjelovanju, ${this.username}.</p>
                <div class="completion-buttons">
                    <button id="reset-evaluation-btn" class="vote-btn">Ponovi evaluaciju</button>
                    <button id="change-user-btn" class="vote-btn tie">Promijeni korisnika</button>
                </div>
            </div>
        `;
        document.getElementById('reset-evaluation-btn').addEventListener('click', () => this.resetEvaluation());
        document.getElementById('change-user-btn').addEventListener('click', () => this.changeUser());
    }
    
    async resetEvaluation() {
        const result = await this.fetchAPI('/api/reset', { username: this.username });
        if (result && result.success) {
            this.startEvaluation();
        }
    }
    
    changeUser() {
        localStorage.removeItem('evaluatorUsername');
        this.username = '';
        window.location.reload(); // Najjednostavniji način za povratak na početak
    }
}
