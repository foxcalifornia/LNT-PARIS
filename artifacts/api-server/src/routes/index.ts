import { Router, type IRouter } from "express";
import healthRouter from "./health";
import caisseRouter from "./caisse";
import inventoryRouter from "./inventory";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/caisse", caisseRouter);
router.use(inventoryRouter);

export default router;
