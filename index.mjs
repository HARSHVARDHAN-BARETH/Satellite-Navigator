import express from "express";
import axios from "axios";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;
const API_KEY = 'Your_API_KEY';

// Middleware
app.use(express.json());
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Helper function to delay execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Route to get satellite data with retry mechanism
app.get('/satellite/:id/:lat/:lng/:alt/:seconds', async (req, res) => {
    const { id, lat, lng, alt, seconds } = req.params;
    const url = `https://api.n2yo.com/rest/v1/satellite/positions/${id}/${lat}/${lng}/${alt}/${seconds}/&apiKey=${API_KEY}`;

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error === "You exceeded the number of transactions allowed per hour") {
            console.error("API rate limit exceeded. Waiting before retrying...");
            await delay(1000); // Initial delay before retrying

            try {
                const retryResponse = await axios.get(url);
                res.json(retryResponse.data);
            } catch (retryError) {
                console.error("Retry failed:", retryError.message);
                res.status(500).json({ error: "Retry failed" });
            }
        } else {
            console.error("Other error:", error.message);
            res.status(500).json({ error: error.message });
        }
    }
});

// HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const { satellites, lat, lng, alt, seconds } = JSON.parse(message);

        // Function to fetch satellite positions at a higher frequency
        const fetchSatellitePositions = async () => {
            for (const satelliteId of satellites) {
                const url = `https://api.n2yo.com/rest/v1/satellite/positions/${satelliteId}/${lat}/${lng}/${alt}/${seconds}/&apiKey=${API_KEY}`;
                try {
                    const response = await fetch(url);
                    const data = await response.json();
                    ws.send(JSON.stringify(data));
                } catch (error) {
                    console.error(`Error fetching data for satellite ${satelliteId}:`, error);
                }
            }
        };

        // Set interval to fetch satellite positions every 500ms
        const intervalId = setInterval(fetchSatellitePositions, 500);

        // Clear interval when connection closes
        ws.on('close', () => clearInterval(intervalId));
    });
});

// Route to render the map page
app.get("/", (req, res) => {
    res.render("map");
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
