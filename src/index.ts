import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="cs">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rezervace školního křečka</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f4f4f9;
                color: #333;
                text-align: center;
                padding: 50px;
            }
            .container {
                background: white;
                max-width: 600px;
                margin: 0 auto;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #ff8c00;
                font-size: 2.5em;
                margin-bottom: 10px;
            }
            p {
                font-size: 1.2em;
                line-height: 1.6;
            }
            .hamster {
                font-size: 80px;
                margin: 20px 0;
            }
            .btn {
                display: inline-block;
                background-color: #ff8c00;
                color: white;
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 5px;
                font-size: 1.1em;
                font-weight: bold;
                margin-top: 20px;
                transition: background 0.3s;
            }
            .btn:hover {
                background-color: #e07b00;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Rezervační systém</h1>
            <div class="hamster">🐹</div>
            <p>Vítejte v oficiálním rezervačním systému pro našeho <strong>školního křečka Ferdu</strong>!</p>
            <p>Aby měl Ferda dostatek odpočinku, prosíme, rezervujte si ho zodpovědně (max. 30 minut denně).</p>
            <a href="#" class="btn" onclick="alert('Zatím ve vývoji! Rezervační API bude brzy napojeno.')">Vytvořit rezervaci</a>
        </div>
    </body>
    </html>
  `;
  res.send(html);
});

app.listen(port, () => {
  console.log(`Server běží na http://localhost:${port}`);
});
