"use strict";

// E1.50 content-security-signal: the corpus of security sinks by stack. Each
// sink is found in the languages where its API exists; a safe form, a comment
// or another language finds nothing (openspec/specs/idd/spec.md, REQ-idd-012).

const test = require("node:test");
const assert = require("node:assert");

const { isCommentOnly, sinkOf } = require("./idd-sinks.js");

// [file, added line, expected sink]
const SINKS = [
  // Go
  ["srv/client.go", "tr := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}", "disabled TLS verification (CWE-295)"],
  ["srv/run.go", 'cmd := exec.Command("sh", "-c", userCmd)', "composed shell command (CWE-78)"],
  ["srv/repo.go", 'q := fmt.Sprintf("SELECT * FROM users WHERE name = \'%s\'", name)', "composed SQL (CWE-89)"],
  ["srv/repo.go", 'rows, err := db.Query("SELECT id FROM orders WHERE owner = " + owner)', "composed SQL (CWE-89)"],
  ["srv/token.go", "token, _, err := parser.ParseUnverified(raw, claims)", "unverified JWT (CWE-347)"],
  ["srv/files.go", "os.WriteFile(path, data, 0666)", "world-writable mode (CWE-732)"],
  // JavaScript and TypeScript
  ["src/calc.js", "const total = eval(formula);", "code evaluation (CWE-94)"],
  ["src/calc.mjs", "const fn = new Function('a', body);", "code evaluation (CWE-94)"],
  ["src/sandbox.cjs", "vm.runInNewContext(code, ctx);", "code evaluation (CWE-94)"],
  ["src/run.ts", "execSync(`git log ${branch}`);", "composed shell command (CWE-78)"],
  ["src/run.js", 'child_process.exec(command, done);', "composed shell command (CWE-78)"],
  ["src/run.js", 'exec("convert " + input + " out.png");', "composed shell command (CWE-78)"],
  ["src/run.js", "require('node:child_process').execSync(`sh ${script}`);", "composed shell command (CWE-78)"],
  ["src/db.ts", "await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);", "composed SQL (CWE-89)"],
  ["src/db.js", 'pool.query("DELETE FROM sessions WHERE token = \'" + token + "\'");', "composed SQL (CWE-89)"],
  ["src/http.js", "const agent = new https.Agent({ rejectUnauthorized: false });", "disabled TLS verification (CWE-295)"],
  ["src/auth.js", "const digest = crypto.createHash('md5').update(password).digest('hex');", "weak credential hash (CWE-327)"],
  ["src/app.tsx", "app.use(session({ csrf: false }));", "disabled CSRF protection (CWE-352)"],
  // Python
  ["app/load.py", "data = pickle.loads(blob)", "unsafe deserialization (CWE-502)"],
  ["app/conf.py", "cfg = yaml.load(stream)", "unsafe YAML load (CWE-502)"],
  ["app/run.py", 'subprocess.run(cmd, shell=True)', "composed shell command (CWE-78)"],
  ["app/run.py", 'os.system("tar xf " + archive)', "composed shell command (CWE-78)"],
  ["app/repo.py", 'cur.execute(f"SELECT * FROM users WHERE name = \'{name}\'")', "composed SQL (CWE-89)"],
  ["app/repo.py", 'cur.execute("SELECT * FROM users WHERE id = %s" % user_id)', "composed SQL (CWE-89)"],
  ["app/fetch.py", 'requests.get("https://api.example.com/v1", verify=False)', "disabled TLS verification (CWE-295)"],
  ["app/token.py", 'claims = jwt.decode(raw, options={"verify_signature": False})', "unverified JWT (CWE-347)"],
  ["app/views.py", "@csrf_exempt", "disabled CSRF protection (CWE-352)"],
  ["app/xml.py", "parser = etree.XMLParser(resolve_entities=True)", "XML external entities (CWE-611)"],
  // Java and Kotlin
  ["src/main/java/Load.java", "ObjectInputStream in = new ObjectInputStream(socket.getInputStream());", "unsafe deserialization (CWE-502)"],
  ["src/main/java/Security.java", "http.csrf().disable();", "disabled CSRF protection (CWE-352)"],
  ["src/main/kotlin/Repo.kt", 'val q = "SELECT * FROM users WHERE id = " + id', "composed SQL (CWE-89)"],
  ["src/main/java/Xml.java", "factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, true);", "XML external entities (CWE-611)"],
  // C#
  ["Api/Load.cs", "var formatter = new BinaryFormatter();", "unsafe deserialization (CWE-502)"],
  ["Api/Http.cs", "ServicePointManager.ServerCertificateValidationCallback = (s, c, ch, e) => true;", "disabled TLS verification (CWE-295)"],
  ["Api/Repo.cs", 'var sql = $"SELECT * FROM Users WHERE Name = \'{name}\'";', "composed SQL (CWE-89)"],
  ["Api/Xml.cs", "settings.DtdProcessing = DtdProcessing.Parse;", "XML external entities (CWE-611)"],
  // Ruby
  ["app/models/user.rb", 'User.find_by_sql("SELECT * FROM users WHERE name = \'#{name}\'")', "composed SQL (CWE-89)"],
  ["app/jobs/run.rb", "`convert #{path} out.png`", "composed shell command (CWE-78)"],
  ["app/load.rb", "obj = Marshal.load(data)", "unsafe deserialization (CWE-502)"],
  ["app/controllers/hooks_controller.rb", "skip_before_action :verify_authenticity_token", "disabled CSRF protection (CWE-352)"],
  // PHP
  ["web/run.php", "system($cmd);", "composed shell command (CWE-78)"],
  ["web/load.php", "$obj = unserialize($_COOKIE['cart']);", "unsafe deserialization (CWE-502)"],
  ["web/repo.php", '$q = "SELECT * FROM users WHERE id = " . $id;', "composed SQL (CWE-89)"],
  ["web/repo.php", '$q = "SELECT * FROM users WHERE id = $id";', "composed SQL (CWE-89)"],
  // Rust and shell
  ["src/client.rs", "let client = Client::builder().danger_accept_invalid_certs(true).build()?;", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "curl -k https://internal/api", "disabled TLS verification (CWE-295)"],
  ["scripts/setup.sh", "chmod -R 777 /srv/data", "world-writable mode (CWE-732)"],
];

// [file, added line]: safe forms, mentions and other languages.
const SAFE = [
  ["src/calc.js", "const value = JSON.parse(text);"],
  ["src/calc.js", "const evaluate = (x) => x * 2;"],
  ["src/calc.py", "value = ast.literal_eval(text)"],
  ["src/match.js", "const found = pattern.exec(input + suffix);"],
  ["src/match.js", "const found = new RegExp(source).exec(input + suffix);"],
  ["src/run.js", "execFileSync('git', ['log', branch]);"],
  ["src/run.js", "spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });"],
  ["src/run.js", 'exec("git status");'],
  ["src/db.js", "await db.query('SELECT * FROM users WHERE id = $1', [id]);"],
  ["src/db.js", "const rows = await sql`SELECT * FROM users WHERE id = ${id}`;"],
  ["src/db.js", 'const q = "SELECT name FROM users".trim();'],
  ["src/ui.js", 'const label = "Select a file from the list: " + name;'],
  ["app/repo.py", 'cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))'],
  ["app/conf.py", "cfg = yaml.load(stream, Loader=yaml.SafeLoader)"],
  ["app/conf.py", "cfg = yaml.safe_load(stream)"],
  ["app/run.py", 'subprocess.run(["tar", "xf", archive])'],
  ["app/fetch.py", 'requests.get("https://api.example.com/v1", timeout=5)'],
  ["src/hash.js", "const sum = crypto.createHash('sha256').update(file).digest('hex');"],
  ["src/hash.go", "sum := md5.Sum(fileBytes)"],
  // A sink of one language in a file of another.
  ["src/calc.go", "result := eval(expression)"],
  ["src/load.js", "const data = pickle.loads(blob);"],
  ["styles/site.css", "content: 'eval(x)';"],
  ["README.txt", "Never call eval(input) on user data."],
];

// [file, added line]: a line only a comment in the language of its file.
const COMMENTS = [
  ["src/calc.js", "// eval(formula) would be shorter"],
  ["src/calc.ts", "/* rejectUnauthorized: false */"],
  ["src/calc.ts", " * new Function(body) is banned here"],
  ["app/load.py", "# data = pickle.loads(blob)"],
  ["scripts/fetch.sh", "# curl -k https://internal/api"],
  ["srv/client.go", "// InsecureSkipVerify: true is never allowed"],
  ["app/load.rb", "# obj = Marshal.load(data)"],
];

test("the corpus finds each sink in the languages where its API exists", () => {
  for (const [file, line, label] of SINKS) assert.strictEqual(sinkOf(file, line), label, `${file}: ${line}`);
});

test("safe forms, mentions and sinks of another language find nothing", () => {
  for (const [file, line] of SAFE) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("a line that is only a comment in the language of its file finds nothing", () => {
  for (const [file, line] of COMMENTS) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("only the comment markers of the file's language skip a line, and code after a closed block comment counts", () => {
  assert.strictEqual(isCommentOnly("src/a.rs", "#[cfg(test)]"), false, "a Rust attribute");
  assert.strictEqual(isCommentOnly("src/a.c", "#include <stdio.h>"), false, "a C directive");
  assert.strictEqual(isCommentOnly("src/a.py", "// not a comment in Python"), false);
  assert.strictEqual(isCommentOnly("src/a.js", "/* note */ eval(code);"), false);
  assert.strictEqual(sinkOf("src/a.js", "/* note */ eval(code);"), "code evaluation (CWE-94)");
  assert.strictEqual(isCommentOnly("src/a.c", "*cmd = 0;"), false, "a dereference");
  assert.strictEqual(isCommentOnly("src/a.vue", "// eval(x)"), false, "a language without rules is never skipped");
});

test("a SafeLoader protects only its own yaml.load call", () => {
  assert.strictEqual(sinkOf("app/conf.py", "a = yaml.load(f, Loader=yaml.CSafeLoader); b = yaml.load(g)"), "unsafe YAML load (CWE-502)");
  assert.strictEqual(sinkOf("app/conf.py", "a = yaml.load(open(f), Loader=SafeLoader)"), null);
});
