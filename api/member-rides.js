import { accountRuntime } from "../server/account-runtime.js";
export default (req, res) => accountRuntime().rides(req, res);
