import { HttpRouter as ConfectHttpRouter } from '@confect/server';
import * as Layer from 'effect/Layer';

import { authKit } from './workosAuth';

const http = ConfectHttpRouter.make(Layer.empty);

authKit.registerRoutes(http);

export default http;
