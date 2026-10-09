package iddsession

import "testing"

// The same cases as countDeclaredChecks in scripts/hooks/idd-session.test.js.
func TestCountDeclaredChecks(t *testing.T) {
	cases := map[string]int{
		"":                            0,
		"checks:\n":                   0,
		"checks:\n  test: npm test\n": 1,
		"# c\nchecks:\n  test: a # b\n  lint: \"b\"\nmode: idd\n": 2,
		"checks:\n  # test: npm test\n":                           0,
		"checks:\n  test:\nimpact:\n  x: y\n":                     0,
		"impact:\n  test: npm test\n":                             0,
		"checks:\r\n  test: npm test\r\n":                         1,
	}
	for text, want := range cases {
		if got := CountDeclaredChecks(text); got != want {
			t.Errorf("CountDeclaredChecks(%q) = %d, want %d", text, got, want)
		}
	}
}
