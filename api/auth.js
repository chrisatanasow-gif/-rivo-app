import { accountRuntime } from "../server/account-runtime.js";
export default (req, res) => accountRuntime().auth(req, res);
