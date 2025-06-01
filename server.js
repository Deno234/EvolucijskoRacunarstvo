const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('app'));

class ModelEvaluationServer {
    constructor() {
        this.inputsPath = path.join(__dirname, 'inputs');
        this.outputsPath = path.join(__dirname, 'outputs');
        this.scoresPath = path.join(__dirname, 'subjective_scores');
        this.allCombinations = [];
        this.currentCombinationIndex = 0;
        
        this.init();
    }

    async init() {
        await this.generateAllCombinations();
        this.setupRoutes();
    }

    async generateAllCombinations() {
        try {
            const inputFiles = await fs.readdir(this.inputsPath);
            const modelDirs = await fs.readdir(this.outputsPath);
            
            console.log(`Pronađeno ${inputFiles.length} input datoteka:`, inputFiles);
            console.log(`Pronađeno ${modelDirs.length} modela:`, modelDirs);
            
            // Generiraj sve kombinacije 2 modela
            const modelPairs = [];
            for (let i = 0; i < modelDirs.length; i++) {
                for (let j = i + 1; j < modelDirs.length; j++) {
                    modelPairs.push([modelDirs[i], modelDirs[j]]);
                }
            }
            
            console.log(`Generirano ${modelPairs.length} parova modela:`, modelPairs);
            
            // Generiraj sve kombinacije inputa i modela
            this.allCombinations = [];
            for (const inputFile of inputFiles) {
                for (const [modelA, modelB] of modelPairs) {
                    this.allCombinations.push({
                        inputFile,
                        modelA,
                        modelB
                    });
                }
            }
            
            // Pomiješaj kombinacije
            this.shuffleArray(this.allCombinations);
            
            console.log(`Ukupno generirano ${this.allCombinations.length} kombinacija za evaluaciju`);
        } catch (error) {
            console.error('Greška pri generiranju kombinacija:', error);
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    setupRoutes() {
        // DODANA NEDOSTAJUĆA RUTA
        app.get('/api/progress', (req, res) => {
            res.json({
                current: this.currentCombinationIndex + 1,
                total: this.allCombinations.length,
                completed: this.currentCombinationIndex >= this.allCombinations.length
            });
        });

        app.get('/api/next-comparison', async (req, res) => {
            try {
                if (this.currentCombinationIndex >= this.allCombinations.length) {
                    return res.json({ completed: true });
                }
                
                const comparison = await this.getCurrentComparison();
                res.json(comparison);
            } catch (error) {
                console.error('Greška:', error);
                res.status(500).json({ error: 'Greška pri generiranju usporedbe' });
            }
        });

        app.post('/api/submit-score', async (req, res) => {
            try {
                const { username, score } = req.body;
                await this.saveScore(username, score);
                this.currentCombinationIndex++;
                res.json({ success: true });
            } catch (error) {
                console.error('Greška:', error);
                res.status(500).json({ error: 'Greška pri spremanju rezultata' });
            }
        });
    }

    async getCurrentComparison() {
        const combination = this.allCombinations[this.currentCombinationIndex];
        
        // Učitaj input
        const inputContent = await fs.readFile(
            path.join(this.inputsPath, combination.inputFile), 
            'utf-8'
        );
        
        // Generiraj nazive output datoteka
        const baseFileName = combination.inputFile.replace('.txt', '');
        const modelAOutputFile = `${combination.modelA}_${baseFileName}_output.txt`;
        const modelBOutputFile = `${combination.modelB}_${baseFileName}_output.txt`;
        
        // Učitaj outpute
        const modelAOutput = await this.loadModelOutput(combination.modelA, modelAOutputFile);
        const modelBOutput = await this.loadModelOutput(combination.modelB, modelBOutputFile);
        
        return {
            inputFile: combination.inputFile,
            input: inputContent.trim(),
            modelA: {
                name: combination.modelA,
                outputFile: modelAOutputFile,
                output: modelAOutput
            },
            modelB: {
                name: combination.modelB,
                outputFile: modelBOutputFile,
                output: modelBOutput
            },
            progress: {
                current: this.currentCombinationIndex + 1,
                total: this.allCombinations.length
            }
        };
    }

    async loadModelOutput(modelName, outputFileName) {
        try {
            const outputPath = path.join(this.outputsPath, modelName, outputFileName);
            const content = await fs.readFile(outputPath, 'utf-8');
            
            // Parsiranje formata "Input: ... Output: ..."
            const lines = content.split('\n');
            const outputLine = lines.find(line => line.startsWith('Output:'));
            
            if (outputLine) {
                return outputLine.replace('Output:', '').trim();
            }
            
            return content.trim();
        } catch (error) {
            console.error(`Greška pri učitavanju ${outputFileName}:`, error);
            return `Greška: Output datoteka ${outputFileName} nije pronađena`;
        }
    }

    async saveScore(username, score) {
        const scoresFile = path.join(this.scoresPath, `scores_${username}.json`);
        
        let existingScores = [];
        try {
            const content = await fs.readFile(scoresFile, 'utf-8');
            existingScores = JSON.parse(content);
        } catch (error) {
            // Datoteka ne postoji, počinjemo s praznim nizom
        }
        
        existingScores.push(score);
        
        await fs.writeFile(scoresFile, JSON.stringify(existingScores, null, 2));
        console.log(`Spremljen rezultat za korisnika ${username}`);
    }
}

// Pokretanje servera
const server = new ModelEvaluationServer();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server pokrenut na portu ${PORT}`);
    console.log(`Otvorite http://localhost:${PORT} u pregledniku`);
});
