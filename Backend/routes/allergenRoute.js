import express from "express";
import { getAllergens, addAllergen, bulkUpsertAllergens } from "../controllers/allergenController.js";

const allergenRouter = express.Router();

allergenRouter.get("/", getAllergens);
allergenRouter.post("/", addAllergen);
allergenRouter.post("/bulk", bulkUpsertAllergens);

export default allergenRouter;
