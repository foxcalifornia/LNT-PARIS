import { Router, type IRouter } from "express";
import healthRouter from "./health";
import caisseRouter from "./caisse";
import inventoryRouter from "./inventory";
import sumupRouter from "./sumup";
import consommablesRouter from "./consommables";
import settingsRouter from "./settings";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/caisse", caisseRouter);
router.use(inventoryRouter);
router.use("/payments", sumupRouter);
router.use(consommablesRouter);
router.use(settingsRouter);
router.use(authRouter);

export default router;
