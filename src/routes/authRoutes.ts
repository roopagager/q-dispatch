// ============================================================================
// Q-Dispatch — auth routes
// ============================================================================

import { Router } from 'express';
import { loginPage, loginPost, logout } from '../middleware/auth';

const router = Router();

router.get('/login', loginPage);
router.post('/api/auth/login', loginPost);
router.post('/api/auth/logout', logout);

export default router;
