document
    .getElementById("loginForm")
    .addEventListener("submit", async function (event) {
        event.preventDefault();

        const kreaId = document.getElementById("kreaId").value;
        const name = document.getElementById("name").value;

        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                krea_id: kreaId,
                name: name
            })
        });

        const result = await response.json();

        if (result.success) {
            window.location.href = "/";
        } else {
            document.getElementById("loginMessage").textContent =
                result.error || "Login failed";
        }
    });