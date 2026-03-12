import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { existsSync } from "fs";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imagePath } = body;

    if (!imagePath) {
      return NextResponse.json(
        { error: 'Path not given.' },
        { status: 400 }
      );
    }

    const fullPath = join(process.cwd(), imagePath);

    if (!existsSync(fullPath)) {
      return NextResponse.json(
        { error: 'Image file not found on server.' },
        { status: 404 }
      );
    }

    const command = `./.venv/bin/python -m deepskin -i "${fullPath}" --pwat`;

    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });

    const match = stdout.match(/PWAT prediction:\s*([0-9.]+)/);

    if (!match) {
      console.error("Terminal output does not contain PWAT score:", { stdout, stderr });
      return NextResponse.json(
        { error: 'Failed to interpret output from predictive model.' },
        { status: 500 }
      );
    }

    const pwatScore = parseFloat(match[1]);

    return NextResponse.json({
      success: true,
      pwatScore: pwatScore
    });
  } catch (error: any) {
    console.error('Error while executing child_process:', error.message || error);
    return NextResponse.json(
      { error: 'Internal error on model execution.' },
      { status: 500 }
    );
  }
}
