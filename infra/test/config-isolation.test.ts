import * as fs from "node:fs";
import * as path from "node:path";

/**
 * EnvironmentConfig型とgetConfig関数の使用がエントリーポイントのみに
 * 限定されていることを検証するテスト
 */
describe("Config Isolation Tests", () => {
  const infraDir = path.join(__dirname, "..");
  const libDir = path.join(infraDir, "lib");
  const configFile = path.join(libDir, "config", "environmental_config.ts");
  const entryPoint = path.join(infraDir, "bin", "infra.ts");

  /**
   * ディレクトリ内のすべての.tsファイルを再帰的に取得
   */
  function getTsFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // node_modules, dist, test などは除外
        if (
          !file.startsWith(".") &&
          file !== "node_modules" &&
          file !== "dist" &&
          file !== "test"
        ) {
          getTsFiles(filePath, fileList);
        }
      } else if (file.endsWith(".ts")) {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

  /**
   * ファイル内で指定されたパターンが使用されているかチェック
   */
  function checkFileForPattern(
    filePath: string,
    pattern: RegExp,
  ): { found: boolean; matches: string[] } {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const matches: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // コメント行は除外
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) {
        continue;
      }

      if (pattern.test(line)) {
        matches.push(`Line ${i + 1}: ${line.trim()}`);
      }
    }

    return { found: matches.length > 0, matches };
  }

  describe("getConfig usage", () => {
    test("getConfig should only be called in the entry point (infra.ts)", () => {
      const allFiles = getTsFiles(infraDir);
      const violations: { file: string; matches: string[] }[] = [];

      for (const file of allFiles) {
        // エントリーポイントと設定ファイル自体は除外
        if (file === entryPoint || file === configFile) {
          continue;
        }

        // getConfigの呼び出しをチェック（importは除外）
        const { found, matches } = checkFileForPattern(file, /getConfig\s*\(/);

        if (found) {
          violations.push({
            file: path.relative(infraDir, file),
            matches,
          });
        }
      }

      if (violations.length > 0) {
        const errorMessage = violations
          .map((v) => `\n  File: ${v.file}\n    ${v.matches.join("\n    ")}`)
          .join("\n");

        throw new Error(
          `getConfig() is called outside of the entry point:${errorMessage}`,
        );
      }
    });

    test("getConfig should be called in the entry point (infra.ts)", () => {
      const { found } = checkFileForPattern(entryPoint, /getConfig\s*\(/);
      expect(found).toBe(true);
    });
  });

  describe("EnvironmentConfig type usage", () => {
    test("EnvironmentConfig type should only be used in environmental_config.ts", () => {
      const allFiles = getTsFiles(infraDir);
      const violations: { file: string; matches: string[] }[] = [];

      for (const file of allFiles) {
        // 設定ファイル自体は除外
        if (file === configFile) {
          continue;
        }

        // EnvironmentConfig型の使用をチェック（importを含む）
        const { found, matches } = checkFileForPattern(
          file,
          /:\s*EnvironmentConfig|<EnvironmentConfig>|import.*EnvironmentConfig/,
        );

        if (found) {
          violations.push({
            file: path.relative(infraDir, file),
            matches,
          });
        }
      }

      if (violations.length > 0) {
        const errorMessage = violations
          .map((v) => `\n  File: ${v.file}\n    ${v.matches.join("\n    ")}`)
          .join("\n");

        throw new Error(
          `EnvironmentConfig type is used outside of environmental_config.ts:${errorMessage}`,
        );
      }
    });

    test("EnvironmentConfig should be defined in environmental_config.ts", () => {
      const { found } = checkFileForPattern(
        configFile,
        /export interface EnvironmentConfig/,
      );
      expect(found).toBe(true);
    });
  });

  describe("Stack Props isolation", () => {
    test("Stack files should define their own Props interfaces", () => {
      const stackFiles = getTsFiles(libDir).filter((file) =>
        file.endsWith("-stack.ts"),
      );

      const stacksWithoutProps: string[] = [];

      for (const file of stackFiles) {
        const content = fs.readFileSync(file, "utf-8");

        // 空のファイルまたはStack classが定義されていないファイルはスキップ
        if (!content.trim() || !/export class \w+Stack/.test(content)) {
          continue;
        }

        const stackName = path
          .basename(file, ".ts")
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join("");

        // StackPropsの定義をチェック（例: NetworkStackProps）
        const propsPattern = new RegExp(
          `interface\\s+${stackName}Props\\s+extends`,
        );
        const { found } = checkFileForPattern(file, propsPattern);

        if (!found) {
          stacksWithoutProps.push(path.relative(infraDir, file));
        }
      }

      if (stacksWithoutProps.length > 0) {
        throw new Error(
          `The following stack files don't define their own Props interface:\n  ${stacksWithoutProps.join("\n  ")}`,
        );
      }
    });

    test("Stack Props should not reference EnvironmentConfig directly", () => {
      const stackFiles = getTsFiles(libDir).filter((file) =>
        file.endsWith("-stack.ts"),
      );

      const violations: { file: string; matches: string[] }[] = [];

      for (const file of stackFiles) {
        // Props内でEnvironmentConfigを参照しているかチェック
        const content = fs.readFileSync(file, "utf-8");

        // interface XXXStackProps の中でEnvironmentConfigが使われているかチェック
        const propsMatch = content.match(
          /interface\s+\w+StackProps[^{]*{[^}]*}/s,
        );

        if (propsMatch && /EnvironmentConfig/.test(propsMatch[0])) {
          violations.push({
            file: path.relative(infraDir, file),
            matches: ["Props interface references EnvironmentConfig"],
          });
        }
      }

      if (violations.length > 0) {
        const errorMessage = violations
          .map((v) => `\n  File: ${v.file}\n    ${v.matches.join("\n    ")}`)
          .join("\n");

        throw new Error(
          `Stack Props should not reference EnvironmentConfig:${errorMessage}`,
        );
      }
    });
  });

  describe("Entry point responsibilities", () => {
    test("infra.ts should import getConfig from environmental_config", () => {
      const { found } = checkFileForPattern(
        entryPoint,
        /import.*getConfig.*environmental_config/,
      );
      expect(found).toBe(true);
    });

    test("infra.ts should pass individual config values to stacks, not the entire config object", () => {
      const content = fs.readFileSync(entryPoint, "utf-8");

      // config.vpc.cidr のような個別の値の参照があることを確認
      const hasIndividualAccess = /config\.vpc\.cidr|config\.bedrockKb/.test(
        content,
      );

      // `config,` や `config: config` のような config オブジェクト全体の受け渡しがないことを確認
      const hasDirectConfigPass = /,\s*config\s*[,}]|config:\s*config/.test(
        content,
      );

      expect(hasIndividualAccess).toBe(true);
      expect(hasDirectConfigPass).toBe(false);
    });
  });
});
