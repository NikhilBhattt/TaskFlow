import express from "express";
import cors from "cors";

const app = express();
app.use(express.urlencoded({extended: true}))
app.use(express.json())
app.use(cors());

app.get("/health", (req, res) => {
  return res.status(200).json({message: "Health Route!"})
})


export default app;
