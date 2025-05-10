import { Router } from "express";
import scrapeLinkedInJobs from "../controllers/jobController.js";

const router = Router();

router.route("/getLinkedInJobs").get(scrapeLinkedInJobs);

export default router;

