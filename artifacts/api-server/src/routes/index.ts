import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bolformRouter from "./bolform";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bolformRouter);

export default router;
