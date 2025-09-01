import type { Diagnostic } from "typescript";
import { flattenDiagnosticMessageText } from "typescript";
import type { ICompilerDiagnostic } from "../definition";

export function normalizeDiagnostics(
    diagnostics: ReadonlyArray<Diagnostic>,
): Array<ICompilerDiagnostic> {
    return diagnostics.map((diag) => {
        const message = flattenDiagnosticMessageText(diag.messageText, "\n");

        const norm: ICompilerDiagnostic = {
            originalDiagnostic: diag,
            originalMessage: message,
            message,
        };

        // Let's make the object more "loggable"
        Object.defineProperties(norm, {
            originalDiagnostic: { enumerable: false },
        });

        if (diag.file) {
            const { line, character } = diag.file.getLineAndCharacterOfPosition(
                diag.start,
            );
            const lineStart = diag.file.getPositionOfLineAndCharacter(line, 0);

            Object.assign(norm, {
                filename: diag.file.fileName,
                line,
                character,
                lineText: diag.file
                    .getText()
                    .substring(
                        lineStart,
                        diag.file.getLineEndOfPosition(lineStart),
                    ),
                message: `Error ${diag.file.fileName} (${line + 1},${character + 1}): ${message}`,
            });
        }

        return norm;
    });
}
