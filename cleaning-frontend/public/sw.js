self.addEventListener("push", function (event) {
  console.log("Push received!", event);

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "Cleaning Platform", body: event.data.text() };
    }
  }

  const title = data.title || "Cleaning Platform";
  const body = data.body || "New notification";

  console.log("Showing notification:", title, body);

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "/logo192.png",
    }),
  );
});
