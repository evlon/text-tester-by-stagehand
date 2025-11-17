import fs from "fs";
import path from "path";
import { z } from "zod";
import { expect } from 'chai';

const runnerContext = {fs,path,z,expect};
export default runnerContext;