class AIModelEvaluator {
    constructor() {
        this.currentComparison = null;
        this.totalQuestions = 0;
        this.currentQuestion = 0;
        
        this.initializeEventListeners();
        this.loadProgress();
    }

    async loadProgress() {
        try {
            const response = await fetch('/api/progress');
            const progress = await response.json();
            
            this.currentQuestion = progress.current;
            this.totalQuestions = progress.total;
            
            if (progress.completed) {
                this.showCompletion();
                return;
            }
            
            this.loadNextComparison();
        } catch (error) {
            console.error('Greška pri dohvaćanju napretka:', error);
        }
    }

    initializeEventListeners() {
        document.getElementById('vote-a').addEventListener('click', () => this.submitVote('A'));
        document.getElementById('vote-b').addEventListener('click', () => this.submitVote('B'));
        document.getElementById('vote-tie').addEventListener('click', () => this.submitVote('TIE'));
        document.getElementById('vote-bad').addEventListener('click', () => this.submitVote('BAD'));
    }

    async loadNextComparison() {
        try {
            const response = await fetch('/api/next-comparison');
            const data = await response.json();
            
            if (data.completed) {
                this.showCompletion();
                return;
            }
            
            this.currentComparison = data;
            this.currentQuestion = data.progress.current;
            this.totalQuestions = data.progress.total;
            
            this.updateUI();
            this.updateProgress();
        } catch (error) {
            console.error('Greška pri dohvaćanju podataka:', error);
        }
    }

    updateUI() {
        document.getElementById('input-text').textContent = this.currentComparison.input;
        document.getElementById('model-a-output').textContent = this.currentComparison.modelA.output;
        document.getElementById('model-b-output').textContent = this.currentComparison.modelB.output;
    }

    updateProgress() {
        const progressPercent = (this.currentQuestion / this.totalQuestions) * 100;
        document.getElementById('progress-fill').style.width = `${progressPercent}%`;
        document.getElementById('progress-text').textContent = `Pitanje ${this.currentQuestion} od ${this.totalQuestions}`;
    }

    async submitVote(decision) {
        const username = document.getElementById('username').value.trim();
        
        if (!username) {
            alert('Molimo unesite vaše ime!');
            return;
        }

        const score = {
            input_file: this.currentComparison.inputFile,
            model_A: this.currentComparison.modelA.name,
            model_B: this.currentComparison.modelB.name,
            model_A_output_file: this.currentComparison.modelA.outputFile,
            model_B_output_file: this.currentComparison.modelB.outputFile,
            decision: decision,
            timestamp: new Date().toISOString(),
            question_number: this.currentQuestion
        };

        try {
            await fetch('/api/submit-score', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, score })
            });

            this.loadNextComparison();
        } catch (error) {
            console.error('Greška pri spremanju rezultata:', error);
            alert('Greška pri spremanju. Pokušajte ponovo.');
        }
    }

    showCompletion() {
        document.querySelector('.container').innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h1>🎉 Čestitamo!</h1>
                <p style="font-size: 1.2em; margin: 20px 0;">Uspješno ste završili svih ${this.totalQuestions} kombinacija!</p>
                <p>Hvala vam na sudjelovanju u evaluaciji AI modela.</p>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AIModelEvaluator();
});
