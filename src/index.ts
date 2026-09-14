import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Vítejte v rezervačním systému pro školního křečka!');
});

app.listen(port, () => {
  console.log(`Server běží na http://localhost:${port}`);
});
