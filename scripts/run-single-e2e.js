/*
 * Executa um único teste E2E rapidamente:
 *   npm run test:e2e:single -- path/para/arquivo.e2e.test.ts
 * Se não for passado argumento, aborta com instrução de uso.
 */

const { spawn } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    'Informe o caminho do teste E2E. Ex:\n  npm run test:e2e:single -- tests/e2e/accessoryOverrides.e2e.test.ts',
  );
  process.exit(1);
}

const testFile = args[0];
console.log(`🎯 Executando teste E2E único: ${testFile}`);

const jest = spawn(
  'npx',
  [
    'jest',
    testFile,
    '--detectOpenHandles',
    '--forceExit',
    '--runInBand',
    '--logHeapUsage',
    '--verbose',
  ],
  { stdio: 'inherit', shell: true },
);

jest.on('close', code => {
  console.log(`✅ Execução finalizada (code=${code})`);
  process.exit(code);
});
