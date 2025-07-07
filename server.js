const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises; // Koristimo alias za 'fs/promises'
const path = require('path');

const app = express();
app.use(express.json());
// Posluživanje statičkih datoteka iz 'public' direktorija
app.use(express.static(path.join(__dirname, 'public')));

class ModelEvaluationServer {
    constructor() {
        this.inputsPath = path.join(__dirname, 'inputs');
        this.outputsPath = path.join(__dirname, 'outputs');
        this.scoresPath = path.join(__dirname, 'subjective_scores');
        this.allCombinations = [];
        this.userProgress = {};
        this.init();
    }

    async init() {
        try {
            await this.generateAllCombinations();
            this.setupRoutes();
        } catch (error) {
            console.error("Fatalna greška tijekom inicijalizacije servera:", error);
            process.exit(1);
        }
    }

    // ISPRAVLJENA I POBOLJŠANA METODA
    async generateAllCombinations() {
        try {
            const inputFiles = await fsp.readdir(this.inputsPath);
            
            // Efikasniji način za dobivanje samo direktorija, bez potrebe za fs.statSync
            const modelDirs = (await fsp.readdir(this.outputsPath, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            const modelPairs = [];
            for (let i = 0; i < modelDirs.length; i++) {
                for (let j = i + 1; j < modelDirs.length; j++) {
                    modelPairs.push([modelDirs[i], modelDirs[j]]);
                }
            }

            this.allCombinations = [];
            for (const inputFile of inputFiles) {
                for (const [modelA, modelB] of modelPairs) {
                    this.allCombinations.push({ inputFile, modelA, modelB });
                }
            }

            this.shuffleArray(this.allCombinations);
            console.log(`Ukupno generirano ${this.allCombinations.length} kombinacija za evaluaciju.`);
        } catch (error) {
            console.error('Greška pri generiranju kombinacija:', error);
            throw error; // Ponovno baci grešku da se uhvati u init()
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    setupRoutes() {
        app.post('/api/next-comparison', async (req, res) => {
            try {
                const { username } = req.body;
                if (!username) return res.status(400).json({ error: 'Korisničko ime je obavezno.' });

                if (!this.userProgress[username]) {
                    this.userProgress[username] = {
                        currentIndex: 0,
                        combinations: [...this.allCombinations]
                    };
                    this.shuffleArray(this.userProgress[username].combinations);
                }

                const userState = this.userProgress[username];
                if (userState.currentIndex >= userState.combinations.length) {
                    return res.json({ completed: true });
                }

                const comparison = await this.getCurrentComparison(userState);
                res.json(comparison);
            } catch (error) {
                console.error('Greška:', error);
                res.status(500).json({ error: 'Greška pri generiranju usporedbe' });
            }
        });

        app.post('/api/submit-score', async (req, res) => {
            try {
                const { username, score } = req.body;
                if (!username || !score || !score.decision) {
                    return res.status(400).json({ error: 'Korisničko ime i odluka su obavezni.' });
                }
                
                if (!this.userProgress[username]) {
                     return res.status(404).json({ error: 'Sesija korisnika nije pronađena.' });
                }

                await this.saveScore(username, score.decision);
                this.userProgress[username].currentIndex++;
                res.json({ success: true });
            } catch (error) {
                console.error('Greška:', error);
                res.status(500).json({ error: 'Greška pri spremanju rezultata' });
            }
        });
        
        app.post('/api/reset', (req, res) => {
            const { username } = req.body;
            if (!username) return res.status(400).json({ error: 'Korisničko ime je obavezno.' });
            
            delete this.userProgress[username];
            res.json({ success: true, message: 'Evaluacija je resetirana.' });
        });
    }

    async getCurrentComparison(userState) {
        const combination = userState.combinations[userState.currentIndex];
        const inputContent = await fsp.readFile(path.join(this.inputsPath, combination.inputFile), 'utf-8');
        const baseFileName = path.parse(combination.inputFile).name;
        
        const modelAOutputFile = `${combination.modelA}_${baseFileName}_output.txt`;
        const modelBOutputFile = `${combination.modelB}_${baseFileName}_output.txt`;

        const modelAOutput = await this.loadModelOutput(combination.modelA, modelAOutputFile);
        const modelBOutput = await this.loadModelOutput(combination.modelB, modelBOutputFile);

        return {
            input: inputContent.trim(),
            modelA: { name: combination.modelA, output: modelAOutput },
            modelB: { name: combination.modelB, output: modelBOutput },
            progress: {
                current: userState.currentIndex + 1,
                total: userState.combinations.length
            }
        };
    }

    async loadModelOutput(modelName, outputFileName) {
        try {
            const outputPath = path.join(this.outputsPath, modelName, outputFileName);
            return await fsp.readFile(outputPath, 'utf-8');
        } catch (error) {
            console.error(`Greška pri učitavanju ${outputFileName}:`, error.code);
            return `Greška: Izlazna datoteka nije pronađena.`;
        }
    }

    async saveScore(username, decision) {
        const userState = this.userProgress[username];
        const combination = userState.combinations[userState.currentIndex];
        const baseFileName = path.parse(combination.inputFile).name;

        const scoreData = {
            input_file: combination.inputFile,
            model_A: combination.modelA,
            model_B: combination.modelB,
            model_A_output_file: `${combination.modelA}_${baseFileName}_output.txt`,
            model_B_output_file: `${combination.modelB}_${baseFileName}_output.txt`,
            decision: decision,
            timestamp: new Date().toISOString(),
            question_number: userState.currentIndex + 1
        };

        const scoresFile = path.join(this.scoresPath, `scores_${username}.json`);
        let existingScores = [];
        try {
            const content = await fsp.readFile(scoresFile, 'utf-8');
            existingScores = JSON.parse(content);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        existingScores.push(scoreData);
        await fsp.writeFile(scoresFile, JSON.stringify(existingScores, null, 2));
    }
}

const server = new ModelEvaluationServer();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server pokrenut na portu ${PORT}`);
    console.log(`Otvorite http://localhost:${PORT} u pregledniku`);
});
