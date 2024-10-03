import express, { Request, Response } from 'express';
import fs from 'fs/promises';
import cors from 'cors';
import { main } from './app';

const app = express();
const port = 5555;
const whitelist = ["http://localhost:5173", "http://localhost:5174"];

const corsOptions = {
  origin: function (origin: any, callback: any) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use(express.json());
app.use(cors(corsOptions));


app.get('/', (req: Request, res: Response) => {
  res.json("running Process");
});

app.get('/startProcess', (req: Request, res: Response) => {
  console.log("calling main process")
  main()
  res.json("running Process");
});


app.get('/params', async (req: Request, res: Response) => {
  try {
    const data = await fs.readFile('param.json', 'utf8');
    const params = JSON.parse(data);
    res.json(params);
  } catch (err) {
    res.status(500).send('Error reading or parsing param.json file');
  }
});


app.get('/wallets', async (req: Request, res: Response) => {
  try {
    const data = await fs.readFile('data.json', 'utf8');
    const wallets = JSON.parse(data);
    res.json({
      wallets: wallets
    });
  } catch (err) {
    res.status(500).send('Error reading or parsing param.json file');
  }
});

app.post('/generate', async (req: Request, res: Response) => {
  console.log("calling updateParams");
  const newParams = req.body;
  console.log("newParams", newParams);

  try {
    const data = await fs.readFile('param.json', 'utf8');
    let params = JSON.parse(data);
    params = { ...params, ...newParams };
    

    await fs.writeFile('param.json', JSON.stringify(params, null, 2));
    main()
    res.send('param.json updated successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating param.json file');
  } finally {
    console.log("Finished processing updateParams");
  }
});

app.post('/params', async (req: Request, res: Response) => {
  console.log("calling updateParams");
  const newParams = req.body;

  try {
    const data = await fs.readFile('param.json', 'utf8');
    let params = JSON.parse(data);
    params = { ...params, ...newParams };
    console.log("update params", params)
    await fs.writeFile('param.json', JSON.stringify(params, null, 2));
    res.send('param.json updated successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating param.json file');
  } finally {
    console.log("Finished processing updateParams");
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
